@echo off
REM ============================================================
REM  Atomkraftwerk - Leitstand zu Firebase hochladen (20.11.2026)
REM  Holt alle Leitstand-Seiten (seit 22.11.: Einzelseiten) aus ..\Programm\web und laedt
REM  sie mit den Firestore-Regeln zu Firebase hoch.
REM ============================================================
chcp 65001 >nul
title Atomkraftwerk - Firebase
cd /d "%~dp0"
findstr /c:"HIER" .firebaserc firestore.rules public\firebase-config.js >nul
if %errorlevel%==0 (
  echo.
  echo   Noch nicht fertig eingerichtet: In .firebaserc, firestore.rules oder
  echo   public\firebase-config.js steht noch "HIER".
  echo.
  pause
  exit /b 1
)
copy /y "..\Programm\web\*.html" "public\" >nul
copy /y "..\Programm\web\*.js" "public\" >nul
copy /y "..\Programm\web\*.css" "public\" >nul
copy /y "..\Programm\web\icon.svg" "public\" >nul
copy /y "..\Programm\web\manifest.webmanifest" "public\" >nul
rem Neuer Versionsstempel, damit Handy und PC die neue Fassung sofort holen
>public\version.json echo {"v":"%date% %time:~0,5%"}
type public\version.json
echo Lade hoch ...
call firebase deploy --only hosting,firestore:rules
echo.
pause
