import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 只跑本仓库自己的测试；packages/ 下各子包（sys-login-mcp、zentao-mcp）的测试由它们各自运行时独立执行
    include: ['test/**/*.test.mjs'],
  },
})
