/**
 * BA PM2 生产启动配置
 *
 * package.json 要求 Node >= 22.18（推荐 24）；这里显式指定 interpreter，
 * 避免 `pm2 start npm` 继承系统旧版 Node。
 * 可通过 BA_NODE_BIN 覆盖解释器路径。
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
