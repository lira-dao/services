import { Module } from '@nestjs/common';
import { PricesController } from './prices.controller';
import { HttpModule } from '@nestjs/axios';
import { PricesService } from './prices.service';

@Module({
  imports: [HttpModule],
  providers: [PricesService],
  controllers: [PricesController],
})
export class PricesModule {}
