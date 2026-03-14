import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ScrapeJob } from './entities/scrape-job.entity';
import { ScrapedPage } from './entities/scraped-page.entity';
// MINIAPP_ENTITY_IMPORT

import { SiteScraperController } from './site-scraper.controller';
import { SiteScraperSseController } from './site-scraper-sse.controller';
import { SiteScraperService } from './services/site-scraper.service';
import { ScraperWorkerService } from './services/scraper-worker.service';
import { ScraperSseService } from './services/scraper-sse.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			ScrapeJob,
			ScrapedPage,
			// MINIAPP_ENTITY_REF
		]),
	],
	controllers: [SiteScraperController, SiteScraperSseController],
	providers: [SiteScraperService, ScraperWorkerService, ScraperSseService],
})
export class SiteScraperModule {}
