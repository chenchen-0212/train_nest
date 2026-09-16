import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @ApiOperation({ summary: '存活探测' })
  check() {
    return {
      status: 'up',
      app: this.config.get<string>('app.name'),
      env: this.config.get<string>('app.env'),
      uptime: Math.floor(process.uptime()),
      timestamp: Date.now(),
    };
  }
}
