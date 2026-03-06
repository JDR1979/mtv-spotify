@echo off
title MTV Spotify Launcher
:: Starts the server in a hidden minimized window
start /min python -m http.server 8080
:: Gives the server 2 seconds to wake up
timeout /t 2 /nobreak > nul
:: Launches Chrome in dedicated App Mode AND Fullscreen
start chrome --app=http://127.0.0.1:8080/ --start-fullscreen
exit