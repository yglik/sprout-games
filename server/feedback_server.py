#!/usr/bin/env python3
"""Sprout Games feedback sink.

Listens on localhost only; nginx proxies /api/feedback (public) and /feedback/
(behind basic auth) to it. Python 3.10 stdlib, no dependencies.

Each submission becomes a directory:
    <STORE>/2026-09-29T14-02-11-ab12cd/
        feedback.json   text + captured context
        audio.m4a       optional recording
"""
import base64
import html
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STORE = os.environ.get('SPROUT_FEEDBACK_STORE', '/var/lib/sprout-feedback')
PORT = int(os.environ.get('SPROUT_FEEDBACK_PORT', '3031'))
MAX_BODY = 12 * 1024 * 1024
MAX_TEXT = 5000
MAX_AUDIO = 10 * 1024 * 1024
ID_RE = re.compile(r'^[0-9A-Za-z_-]{1,64}$')
EXT = {'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a',
       'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav'}
MIME = {'m4a': 'audio/mp4', 'webm': 'audio/webm', 'ogg': 'audio/ogg', 'mp3': 'audio/mpeg', 'wav': 'audio/wav'}

_hits = {}          # ip -> [timestamps], a light brake on accidental floods


def rate_ok(ip, limit=30, window=3600):
    now = time.time()
    seen = [t for t in _hits.get(ip, []) if now - t < window]
    seen.append(now)
    _hits[ip] = seen[-limit:]
    return len(seen) <= limit


def entries():
    if not os.path.isdir(STORE):
        return []
    out = []
    for name in sorted(os.listdir(STORE), reverse=True):
        path = os.path.join(STORE, name, 'feedback.json')
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding='utf-8') as fh:
                rec = json.load(fh)
        except Exception:
            continue
        rec['_id'] = name
        audio = [f for f in os.listdir(os.path.join(STORE, name)) if f.startswith('audio.')]
        rec['_audio'] = audio[0] if audio else None
        out.append(rec)
    return out


PAGE_HEAD = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sprout feedback</title><style>
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f6f2ea;color:#33242e}
header{padding:18px 20px;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,.08);position:sticky;top:0}
h1{margin:0;font-size:19px}
.count{color:#8a7f93;font-size:13px}
.wrap{padding:18px 20px;max-width:820px;margin:0 auto}
.card{background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
.meta{font-size:12.5px;color:#8a7f93;display:flex;gap:10px;flex-wrap:wrap}
.game{font-weight:700;color:#2b5d34}
.text{margin:8px 0;white-space:pre-wrap;font-size:16px}
.text.empty{color:#b3a8bd;font-style:italic}
audio{width:100%;margin-top:6px}
details{margin-top:8px;font-size:12.5px;color:#8a7f93}
pre{white-space:pre-wrap;word-break:break-word;background:#f4efe5;border-radius:10px;padding:8px 10px;font-size:11.5px;overflow:auto}
.none{color:#8a7f93;text-align:center;padding:40px 0}
</style></head><body>"""


class Handler(BaseHTTPRequestHandler):
    server_version = 'sprout-feedback'

    def log_message(self, fmt, *args):      # journald already timestamps
        print(fmt % args, flush=True)

    def _send(self, code, body=b'', ctype='application/json', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def do_POST(self):
        if self.path.rstrip('/') != '/api/feedback':
            return self._send(404, b'{"error":"not found"}')
        if not rate_ok(self.client_ip()):
            return self._send(429, b'{"error":"slow down"}')
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return self._send(400, b'{"error":"bad length"}')
        if length <= 0 or length > MAX_BODY:
            return self._send(413, b'{"error":"too big"}')
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return self._send(400, b'{"error":"bad json"}')

        text = str(payload.get('text') or '')[:MAX_TEXT]
        context = payload.get('context')
        if not isinstance(context, dict):
            context = {'note': 'no context supplied'}
        audio_b64 = payload.get('audio')
        audio_type = str(payload.get('audioType') or '').split(';')[0].strip().lower()
        if not text and not audio_b64:
            return self._send(400, b'{"error":"empty"}')

        stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S')
        entry_id = '%s-%s' % (stamp, secrets.token_hex(3))
        folder = os.path.join(STORE, entry_id)
        os.makedirs(folder, exist_ok=True)

        saved_audio = None
        if audio_b64:
            raw = audio_b64.split(',', 1)[-1]
            try:
                blob = base64.b64decode(raw, validate=False)
            except Exception:
                blob = b''
            if 0 < len(blob) <= MAX_AUDIO:
                ext = EXT.get(audio_type, 'webm')
                saved_audio = 'audio.' + ext
                with open(os.path.join(folder, saved_audio), 'wb') as fh:
                    fh.write(blob)

        record = {
            'id': entry_id,
            'receivedAt': datetime.now(timezone.utc).isoformat(),
            'ip': self.client_ip(),
            'text': text,
            'audioFile': saved_audio,
            'audioType': audio_type or None,
            'context': context,
        }
        with open(os.path.join(folder, 'feedback.json'), 'w', encoding='utf-8') as fh:
            json.dump(record, fh, ensure_ascii=False, indent=2)
        return self._send(200, json.dumps({'ok': True, 'id': entry_id}).encode())

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/')
        if path in ('/feedback/health', '/health'):
            return self._send(200, b'{"ok":true}')
        if path in ('', '/feedback'):
            return self._send(200, self.render().encode('utf-8'), 'text/html; charset=utf-8')
        m = re.match(r'^/feedback/([^/]+)/(audio\.[a-z0-9]+)$', path)
        if m and ID_RE.match(m.group(1)):
            fp = os.path.join(STORE, m.group(1), m.group(2))
            if os.path.isfile(fp):
                with open(fp, 'rb') as fh:
                    blob = fh.read()
                ext = m.group(2).rsplit('.', 1)[-1]
                return self._send(200, blob, MIME.get(ext, 'application/octet-stream'),
                                  {'Cache-Control': 'private, max-age=300'})
        return self._send(404, b'not found', 'text/plain')

    def render(self):
        rows = entries()
        parts = [PAGE_HEAD,
                 '<header><h1>Sprout feedback</h1>',
                 '<div class="count">%d %s</div></header><div class="wrap">'
                 % (len(rows), 'entry' if len(rows) == 1 else 'entries')]
        if not rows:
            parts.append('<p class="none">Nothing yet.</p>')
        for rec in rows:
            ctx = rec.get('context') or {}
            state = ctx.get('state') or {}
            screen = ctx.get('screen') or {}
            when = html.escape(str(rec.get('receivedAt', ''))[:19].replace('T', ' ')) + ' UTC'
            bits = [
                '<span class="game">%s</span>' % html.escape(str(ctx.get('title') or ctx.get('game') or 'unknown')),
                when,
                html.escape('%sx%s %s' % (screen.get('w', '?'), screen.get('h', '?'),
                                          screen.get('orientation', ''))),
            ]
            if ctx.get('standalone'):
                bits.append('installed app')
            parts.append('<div class="card"><div class="meta">%s</div>' % ' &middot; '.join(bits))
            text = rec.get('text') or ''
            parts.append('<div class="text%s">%s</div>'
                         % ('' if text else ' empty', html.escape(text) if text else '(voice only)'))
            if rec.get('_audio'):
                parts.append('<audio controls preload="none" src="/feedback/%s/%s"></audio>'
                             % (html.escape(rec['_id']), html.escape(rec['_audio'])))
            summary = json.dumps({'state': state, 'context': ctx}, ensure_ascii=False, indent=1)
            parts.append('<details><summary>details</summary><pre>%s</pre></details></div>'
                         % html.escape(summary))
        parts.append('</div></body></html>')
        return ''.join(parts)


if __name__ == '__main__':
    os.makedirs(STORE, exist_ok=True)
    print('sprout-feedback listening on 127.0.0.1:%d, store=%s' % (PORT, STORE), flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
