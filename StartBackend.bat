@echo off
title YouTube Automation Backend Server
echo ==============================================
echo    Starting YouTube Automation Backend Server
echo ==============================================
echo.

:: Navigate to the folder where this batch file is located
cd /d "%~dp0"

:: Then enter the backend folder
cd backend

npm start
pause
