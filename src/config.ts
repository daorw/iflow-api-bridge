/**
 * 配置管理
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface Config {
  port: number;
  host: string;
  cors: boolean;
  apiKey?: string;
  model?: string;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export const DEFAULT_CONFIG: Config = {
  port: 8080,
  host: '0.0.0.0',
  cors: true,
  model: 'kimi-k2.5',
  logLevel: 'INFO',
};

/**
 * 从文件加载配置
 */
export function loadConfig(configPath?: string): Partial<Config> {
  const paths = configPath
    ? [configPath]
    : [
        './iflow-api.config.json',
        './.iflow-api.json',
        '~/.iflow-api/config.json',
      ];

  for (const path of paths) {
    const fullPath = resolve(path.replace(/^~/, process.env.HOME || ''));
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`无法加载配置文件 ${path}:`, error);
      }
    }
  }

  return {};
}

/**
 * 从环境变量加载配置
 */
export function loadEnvConfig(): Partial<Config> {
  const config: Partial<Config> = {};

  if (process.env.IFLOW_API_PORT) {
    config.port = parseInt(process.env.IFLOW_API_PORT, 10);
  }

  if (process.env.IFLOW_API_HOST) {
    config.host = process.env.IFLOW_API_HOST;
  }

  if (process.env.IFLOW_API_KEY) {
    config.apiKey = process.env.IFLOW_API_KEY;
  }

  if (process.env.IFLOW_API_LOG_LEVEL) {
    const level = process.env.IFLOW_API_LOG_LEVEL as Config['logLevel'];
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level)) {
      config.logLevel = level;
    }
  }

  if (process.env.IFLOW_API_CORS) {
    config.cors = process.env.IFLOW_API_CORS === 'true';
  }

  if (process.env.IFLOW_API_MODEL) {
    config.model = process.env.IFLOW_API_MODEL;
  }

  return config;
}

/**
 * 合并配置
 */
export function mergeConfig(
  fileConfig: Partial<Config>,
  envConfig: Partial<Config>,
  cliConfig: Partial<Config>
): Config {
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...cliConfig,
  };
}