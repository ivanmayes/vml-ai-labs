import { NgModule, Optional, SkipSelf } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { CommonModule } from '@angular/common';

import { RequestInterceptor } from './interceptors/request.interceptor';
import { WppOpenService } from './services/wpp-open/wpp-open.service';

@NgModule({
	imports: [CommonModule],
	exports: [],
	declarations: [],
	providers: [
		WppOpenService,
		{
			provide: HTTP_INTERCEPTORS,
			useClass: RequestInterceptor,
			multi: true,
		},
	],
})
export class CoreModule {
	constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
		if (parentModule) {
			throw new Error(
				`Core Module has already been loaded. Import Core modules in the AppModule only.`,
			);
		}
	}
}
