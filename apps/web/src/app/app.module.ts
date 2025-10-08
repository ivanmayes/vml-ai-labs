import { BrowserModule, Title } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { SharedModule } from './shared/shared.module';
import { PrimeNgModule } from './shared/primeng.module';
import { HttpClientModule, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AkitaNgRouterStoreModule } from '@datorama/akita-ng-router-store';
import { RequestInterceptor } from './_core/interceptors/request.interceptor';

// PrimeNG Configuration
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeng/themes/lara';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		AppRoutingModule,
		BrowserAnimationsModule,
		AkitaNgRouterStoreModule,
		PrimeNgModule,
		SharedModule
	],
	providers: [
		Title,
		provideHttpClient(withInterceptorsFromDi()),
		{
			provide: HTTP_INTERCEPTORS,
			useClass: RequestInterceptor,
			multi: true
		},
		providePrimeNG({
			theme: {
				preset: Lara,
				options: {
					prefix: 'p',
					darkModeSelector: '.p-dark',
					cssLayer: false
				}
			},
			ripple: false,
			inputVariant: 'outlined'
		})
	],
	bootstrap: [AppComponent]
})
export class AppModule {}
