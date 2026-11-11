@echo off
REM EV MASTER LAB - local launcher (Windows). Developed by Dr Bansilal Bairwa, REVA University.
REM Requires Python 3 (python.org). Starts a local web server and opens the laboratory in your browser.
cd /d "%~dp0\.."
echo Starting EV MASTER LAB at http://localhost:8080 ...  (close this window to stop)
start "" http://localhost:8080/index.html
python -m http.server 8080 || py -m http.server 8080
pause
