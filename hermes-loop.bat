@echo off
title Hermes Voice Agent
cd /d "%~dp0"
:loop
"C:\Program Files\nodejs\node.exe" src\index.js >> "%~dp0hermes.log" 2>> "%~dp0hermes.err.log"
timeout /t 5 /nobreak >nul
goto loop
