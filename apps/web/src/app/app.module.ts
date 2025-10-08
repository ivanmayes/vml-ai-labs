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
import { definePreset } from '@primeng/themes';
import Lara from '@primeng/themes/lara';

// Define custom blue theme based on Lara
const LaraBlue = definePreset(Lara, {
	semantic: {
		primary: {
			50: '{blue.50}',
			100: '{blue.100}',
			200: '{blue.200}',
			300: '{blue.300}',
			400: '{blue.400}',
			500: '{blue.500}',
			600: '{blue.600}',
			700: '{blue.700}',
			800: '{blue.800}',
			900: '{blue.900}',
			950: '{blue.950}'
		}
	}
});

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
				preset: LaraBlue,
				options: {
					prefix: 'p',
					darkModeSelector: '.p-dark',
					cssLayer: false
				}
			},
			ripple: true,
			inputVariant: 'outlined'
		})
	],
	bootstrap: [AppComponent]
})
export class AppModule {}
