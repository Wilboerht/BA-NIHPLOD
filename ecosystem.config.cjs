/**
 * BA PM2 生产启动配置
 *
 * 服务器文档要求 Node 24（/usr/local/bin/node）；旧配置通过 `pm2 start npm`
 * 继承了系统 Node 20，这里显式指定 interpreter，避免 Node 版本不一致。
 */
module.exports = {
  apps: [
    {
      name: "ba-nihplod-app",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      interpreter: process.env.BA_NODE_BIN || "/usr/local/bin/node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
