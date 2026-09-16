import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller.js';

/** ⚠️ 教学演示模块，阶段二删除 */
@Module({
  controllers: [DemoController],
})
export class DemoModule {}
