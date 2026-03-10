@echo off
title › Puff App
SET PATH=%PATH%;C:\Program Files\nodejs
cd /d "G:\Claude Code\puff-app"
echo.
echo  Starting Puff App...
echo  Close this window to stop the server.
echo.
node --experimental-sqlite server.js
pause
