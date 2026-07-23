import sqlite3
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
import os
import shutil
import json

app = Flask(__name__, static_folder='.', static_url_path='')

QUARANTINE_DIR = 'quarantine'
if not os.path.exists(QUARANTINE_DIR):
    os.makedirs(QUARANTINE_DIR)

def get_db_connection():
    conn = sqlite3.connect('dashboard.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/chart_data')
def chart_data():
    try:
        with open('output/line_chart_data.json', 'r') as f:
            return jsonify(json.load(f))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/gallery_data')
def gallery_data():
    conn = get_db_connection()
    
    # We want ALL models so we know which models evaluated the files.
    models = [r['model'] for r in conn.execute("SELECT DISTINCT model FROM wrong_predictions").fetchall()]
    
    # history
    history = conn.execute("SELECT file_path, class as true_class, chunk_index FROM chunk_history WHERE split='test'").fetchall()
    
    # wrongs
    wrongs = conn.execute("SELECT file_path, model, chunk_index, predicted_class FROM wrong_predictions").fetchall()
    
    # tags
    tags = conn.execute("SELECT file_path, tag FROM image_tags").fetchall()
    
    conn.close()
    
    # Aggregate
    files = {}
    for h in history:
        fp = h['file_path']
        if fp not in files:
            files[fp] = {
                'file_path': fp,
                'true_class': h['true_class'],
                'chunks': set(),
                'error_count': 0,
                'predictions': {},
                'tags': []
            }
        files[fp]['chunks'].add(h['chunk_index'])
        
    for w in wrongs:
        fp = w['file_path']
        if fp in files:
            files[fp]['error_count'] += 1
            mod = w['model']
            if mod not in files[fp]['predictions']:
                files[fp]['predictions'][mod] = {}
            files[fp]['predictions'][mod][w['chunk_index']] = w['predicted_class']
            
    for t in tags:
        fp = t['file_path']
        if fp in files:
            files[fp]['tags'].append(t['tag'])
            
    # Format for JSON
    result = []
    for fp, info in files.items():
        info['chunks'] = sorted(list(info['chunks']))
        formatted_preds = {}
        for m in models:
            formatted_preds[m] = []
            for c in info['chunks']:
                if m in info['predictions'] and c in info['predictions'][m]:
                    formatted_preds[m].append({'chunk': c, 'status': 'wrong', 'predicted_class': info['predictions'][m][c]})
                else:
                    formatted_preds[m].append({'chunk': c, 'status': 'correct', 'predicted_class': info['true_class']})
        info['predictions'] = formatted_preds
        
        # Check quarantine
        local_path = fp
        physical_orig = fp
        physical_quar = os.path.join(QUARANTINE_DIR, fp)
        
        if len(info['tags']) > 0:
            if os.path.exists(physical_quar):
                local_path = 'quarantine/' + fp
        else:
            if not os.path.exists(physical_orig) and os.path.exists(physical_quar):
                local_path = 'quarantine/' + fp
                
        info['display_path'] = local_path
        result.append(info)
        
    return jsonify({'data': result, 'models': models})

@app.route('/api/tags', methods=['POST'])
def manage_tags():
    data = request.json
    file_path = data.get('file_path')
    tag = data.get('tag')
    action = data.get('action') # 'add' or 'remove'
    
    if not file_path or not tag or not action:
        return jsonify({'error': 'Missing parameters'}), 400
        
    conn = get_db_connection()
    try:
        current_tags = [r['tag'] for r in conn.execute("SELECT tag FROM image_tags WHERE file_path=?", (file_path,)).fetchall()]
        
        if action == 'add':
            if tag not in current_tags:
                conn.execute("INSERT INTO image_tags (file_path, tag) VALUES (?, ?)", (file_path, tag))
                current_tags.append(tag)
        elif action == 'remove':
            if tag in current_tags:
                conn.execute("DELETE FROM image_tags WHERE file_path=? AND tag=?", (file_path, tag))
                current_tags.remove(tag)
                
        conn.commit()
        
        dest_path = os.path.join(QUARANTINE_DIR, file_path)
        orig_path = file_path
        
        if len(current_tags) > 0:
            if os.path.exists(orig_path):
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                shutil.move(orig_path, dest_path)
        else:
            if os.path.exists(dest_path):
                os.makedirs(os.path.dirname(orig_path), exist_ok=True)
                shutil.move(dest_path, orig_path)
                
        new_path = ('quarantine/' + file_path) if len(current_tags) > 0 else file_path
        
        return jsonify({'success': True, 'tags': current_tags, 'display_path': new_path})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
