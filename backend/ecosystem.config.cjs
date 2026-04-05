/** PM2: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'avitolog-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 8787
      }
    }
  ]
};
