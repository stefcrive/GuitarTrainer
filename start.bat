@echo off
cd %~dp0
echo Installing dependencies...
call npm install
echo Starting development server...
call npm run dev