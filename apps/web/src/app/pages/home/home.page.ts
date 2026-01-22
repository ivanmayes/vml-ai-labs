import { Component, ElementRef, ViewChild } from '@angular/core';
import { fade } from '../../_core/utils/animations.utils';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { MessageService } from 'primeng/api';

/**
 * Feature interface for the features overview section
 */
interface Feature {
	icon: string;
	title: string;
	description: string;
}

/**
 * Home Page Component
 *
 * UX Design Notes:
 * - Welcoming hero section introduces users to the boilerplate
 * - Setup cards provide actionable guidance for getting started
 * - Features overview highlights what's included in the starter
 * - Debug data is hidden in collapsible accordion to reduce clutter
 * - All actions have placeholder implementations with helpful messages
 */
@Component({
	standalone: false,
	selector: 'app-home',
	templateUrl: './home.page.html',
	styleUrls: ['./home.page.scss'],
	animations: [fade('fade', 400, '-50%')],
})
export class HomeComponent {
	@ViewChild('setupSection') setupSection: ElementRef;

	/**
	 * Features included in the boilerplate
	 * Displayed in the features overview section
	 */
	public features: Feature[] = [
		{
			icon: 'shield',
			title: 'Authentication',
			description:
				'Built-in authentication system with JWT tokens and session management',
		},
		{
			icon: 'database',
			title: 'State Management',
			description:
				'Akita state management for predictable and scalable app state',
		},
		{
			icon: 'th-large',
			title: 'PrimeNG Components',
			description: 'Rich set of UI components from PrimeNG v20 library',
		},
		{
			icon: 'palette',
			title: 'Design System',
			description: 'Comprehensive design tokens and theming capabilities',
		},
		{
			icon: 'mobile',
			title: 'Responsive Design',
			description:
				'Mobile-first responsive layout that works on all devices',
		},
		{
			icon: 'code',
			title: 'TypeScript',
			description: 'Fully typed codebase with Angular 20 and TypeScript',
		},
	];

	constructor(
		private readonly http: HttpClient,
		private readonly messageService: MessageService,
	) {}

	/**
	 * Scroll to the setup section smoothly
	 */
	scrollToSetup(): void {
		if (this.setupSection?.nativeElement) {
			this.setupSection.nativeElement.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
			});
		}
	}

	/**
	 * Open documentation (placeholder)
	 */
	openDocumentation(): void {
		this.messageService.add({
			severity: 'info',
			summary: 'Documentation',
			detail: 'Documentation will be available soon. Check the README for setup instructions.',
			life: 3000,
		});
	}

	/**
	 * Navigate to API configuration (placeholder)
	 */
	navigateToApiConfig(): void {
		this.messageService.add({
			severity: 'info',
			summary: 'API Configuration',
			detail: 'Check the environment.ts files in the environments folder to configure your API.',
			life: 3000,
		});
	}

	/**
	 * Open theme settings (placeholder)
	 */
	openThemeSettings(): void {
		this.messageService.add({
			severity: 'info',
			summary: 'Theme Settings',
			detail: 'Modify theme variables in the design-system.scss file to customize your theme.',
			life: 3000,
		});
	}

	/**
	 * View page templates (placeholder)
	 */
	viewPageTemplates(): void {
		this.messageService.add({
			severity: 'info',
			summary: 'Page Templates',
			detail: 'Use Angular CLI to generate new pages: ng generate component pages/your-page',
			life: 3000,
		});
	}

	/**
	 * Open deploy guide (placeholder)
	 */
	openDeployGuide(): void {
		this.messageService.add({
			severity: 'info',
			summary: 'Deployment',
			detail: 'Run "npm run build" to create a production build. Deploy the dist folder to your hosting provider.',
			life: 3000,
		});
	}
}
