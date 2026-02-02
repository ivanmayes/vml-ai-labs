import { BrowserModule, Title } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {
	HTTP_INTERCEPTORS,
	provideHttpClient,
	withInterceptorsFromDi,
} from '@angular/common/http';
import { AkitaNgRouterStoreModule } from '@datorama/akita-ng-router-store';

// PrimeNG Configuration
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Lara from '@primeng/themes/lara';

import { RequestInterceptor } from './_core/interceptors/request.interceptor';
import { PrimeNgModule } from './shared/primeng.module';
import { SharedModule } from './shared/shared.module';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

// Define WPP Open theme based on Lara
const WppOpenPreset = definePreset(Lara, {
	primitive: {
		// WPP Purple palette
		purple: {
			50: '#EEE8FF',
			100: '#DBD2FA',
			200: '#CAB8FF',
			300: '#BC71FB',
			400: '#8508E8',
			500: '#5E00B5',
			600: '#47039B',
			700: '#2F0069',
			800: '#19022C',
			900: '#0B001C',
			950: '#050010',
		},
		// WPP Grey palette (for surfaces)
		slate: {
			0: '#FFFFFF',
			50: '#F8F9FB',
			100: '#F4F5F7',
			200: '#E7EAEE',
			300: '#C1C7CD',
			400: '#A2A9B0',
			500: '#8B919A',
			600: '#697077',
			700: '#4D5358',
			800: '#343A3F',
			900: '#121619',
			950: '#0A0C0E',
		},
	},
	semantic: {
		primary: {
			50: '{purple.50}',
			100: '{purple.100}',
			200: '{purple.200}',
			300: '{purple.300}',
			400: '{purple.400}',
			500: '{purple.500}',
			600: '{purple.600}',
			700: '{purple.700}',
			800: '{purple.800}',
			900: '{purple.900}',
			950: '{purple.950}',
		},
		colorScheme: {
			light: {
				surface: {
					0: '{slate.0}',
					50: '{slate.50}',
					100: '{slate.100}',
					200: '{slate.200}',
					300: '{slate.300}',
					400: '{slate.400}',
					500: '{slate.500}',
					600: '{slate.600}',
					700: '{slate.700}',
					800: '{slate.800}',
					900: '{slate.900}',
					950: '{slate.950}',
				},
			},
			dark: {
				surface: {
					0: '{slate.950}',
					50: '{slate.900}',
					100: '{slate.800}',
					200: '{slate.700}',
					300: '{slate.600}',
					400: '{slate.500}',
					500: '{slate.400}',
					600: '{slate.300}',
					700: '{slate.200}',
					800: '{slate.100}',
					900: '{slate.50}',
					950: '{slate.0}',
				},
				primary: {
					color: '{purple.400}',
					contrastColor: '{slate.900}',
				},
			},
		},
	},
});

@NgModule({
	imports: [
		BrowserModule,
		AppRoutingModule,
		BrowserAnimationsModule,
		AkitaNgRouterStoreModule,
		PrimeNgModule,
		SharedModule,
		AppComponent,
	],
	providers: [
		Title,
		provideHttpClient(withInterceptorsFromDi()),
		{
			provide: HTTP_INTERCEPTORS,
			useClass: RequestInterceptor,
			multi: true,
		},
		providePrimeNG({
			theme: {
				preset: WppOpenPreset,
				options: {
					prefix: 'p',
					darkModeSelector: '.p-dark',
					cssLayer: false,
				},
			},
			ripple: true,
			inputVariant: 'outlined',
		}),
	],
	bootstrap: [AppComponent],
})
export class AppModule {}
