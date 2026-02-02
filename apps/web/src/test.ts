// This file is required by karma.conf.js and loads recursively all the .spec and framework files
/// <reference types="jasmine" />

// Note: Zoneless mode enabled - tests must use TestBed.configureTestingModule with
// provideZonelessChangeDetection() or use async/await patterns instead of fakeAsync/tick.

import { getTestBed } from '@angular/core/testing';
import {
	BrowserDynamicTestingModule,
	platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
	BrowserDynamicTestingModule,
	platformBrowserDynamicTesting(),
	{ teardown: { destroyAfterEach: true } },
);
