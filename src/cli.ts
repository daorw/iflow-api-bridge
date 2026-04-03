#!/usr/bin/env node

/**
 * CLI 入口
 */

import { Command } from 'commander';
import { IFlowAPIServer } from './server.js';
import { loadConfig, loadEnvConfig, mergeConfig, type Config } from './config.js';

const program = new Command();

program
  .name('iflow-api-server')
  .description('将 iFlow LLM 服务暴露为 OpenAI 兼容 API')
  .version('0.1.0');

program
  .option('-p, --port <port>', '服务端口', '8080')
  .option('-h, --host <host>', '服务主机', '0.0.0.0')
  .option('--no-cors', '禁用 CORS')
  .option('-k, --api-key <key>', 'API Key 认证')
  .option('-m, --model <model>', '指定使用的模型 (如 claude, gpt-4)', 'kimi-k2.5')
  .option('-c, --config <path>', '配置文件路径')
  .option('--log-level <level>', '日志级别 (DEBUG|INFO|WARN|ERROR)', 'INFO')
  .action(async (options) => {
    try {
      // 加载配置
      const fileConfig = loadConfig(options.config);
      const envConfig = loadEnvConfig();
      const cliConfig: Partial<Config> = {
        port: options.port ? parseInt(options.port, 10) : undefined,
        host: options.host,
        cors: options.cors,
        apiKey: options.apiKey,
        model: options.model,
        logLevel: options.logLevel,
      };

      // 合并配置
      const config = mergeConfig(fileConfig, envConfig, cliConfig);

      // 创建并启动服务器
      const server = new IFlowAPIServer(config);

      // 处理退出信号
      const shutdown = async (signal: string) => {
        console.log(`\n${signal} 收到，正在关闭服务器...`);
        await server.stop();
        process.exit(0);
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));

      // 启动
      await server.start();
    } catch (error) {
      console.error('启动失败:', error);
      process.exit(1);
    }
  });

program.parse();