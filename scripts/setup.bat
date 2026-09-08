@echo off
REM SecureContent AI — Local setup (Windows cmd)
setlocal
cd /d "%~dp0\.."

echo == SecureContent AI — Windows setup (cmd) ==

where bun >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Installing bun via npm...
  call npm i -g bun
)

echo >> bun install
call bun install

if not exist .env (
  copy .env.example .env
  echo Created .env
)

echo >> prisma db push
set DATABASE_URL=file:./dev.db
call bunx prisma db push --accept-data-loss
call bunx prisma generate

echo.
echo Setup complete.
echo   Start dev server:  bun run dev
echo   Open:              http://localhost:3000
endlocal
