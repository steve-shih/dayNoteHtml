module.exports = {
  apps: [
    {
      name: "dayNote-frontend",
      script: "node_modules/next/dist/bin/next",
      args: "dev",
      cwd: "./frontend"
    },
    {
      name: "dayNote-backend",
      script: ".\\venv\\Scripts\\waitress-serve.exe",
      args: "--listen=127.0.0.1:5000 app:app",
      cwd: "./backend"
    }
  ]
}
