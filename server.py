import http.server
import socketserver
import os
import cgi

PORT = 8080
UPLOAD_DIR = 'downloads'

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/upload':
            try:
                content_type, pdict = cgi.parse_header(self.headers['content-type'])
                if content_type == 'multipart/form-data':
                    pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
                    fields = cgi.parse_multipart(self.rfile, pdict)
                    
                    # Get file data
                    # Note: This simple parser might behave differently depending on python version/environment
                    # For robustness in a simple script, we assume standard multipart
                    
                    files = fields.get('file')
                    filenames = fields.get('filename') # Sometimes filename is separate or in the object
                    
                    # cgi.parse_multipart is tricky with binary files in newer python versions
                    # Let's use a more robust approach with cgi.FieldStorage for the file
                    
                    form = cgi.FieldStorage(
                        fp=self.rfile,
                        headers=self.headers,
                        environ={'REQUEST_METHOD': 'POST',
                                 'CONTENT_TYPE': self.headers['Content-Type'],
                                 }
                    )
                    
                    if 'file' in form:
                        fileitem = form['file']
                        if fileitem.filename:
                            fn = os.path.basename(fileitem.filename)
                            save_path = os.path.join(UPLOAD_DIR, fn)
                            with open(save_path, 'wb') as f:
                                f.write(fileitem.file.read())
                            
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(bytes(f'{{"url": "{UPLOAD_DIR}/{fn}"}}', 'utf-8'))
                            return

            except Exception as e:
                print(e)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(bytes(f'{{"error": "{str(e)}"}}', 'utf-8'))
                return
        
        self.send_response(404)
        self.end_headers()

print(f"Server läuft auf http://localhost:{PORT}")
print(f"Uploads werden in '{UPLOAD_DIR}/' gespeichert.")

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
