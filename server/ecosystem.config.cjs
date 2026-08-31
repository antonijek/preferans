module.exports = {
  apps: [
    {
      name: 'pref-server',
      script: 'dist/index.js',
      cwd: __dirname,
      env: {
        PORT: 3001,
      },
    },
  ],
};
