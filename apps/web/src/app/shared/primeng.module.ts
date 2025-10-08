import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// PrimeNG Components - Initial imports based on PRD requirements
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { DynamicDialogModule } from 'primeng/dynamicdialog';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';

// Form Components
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FloatLabelModule } from 'primeng/floatlabel';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SliderModule } from 'primeng/slider';
import { InputOtpModule } from 'primeng/inputotp';

// Message Components
import { MessageModule } from 'primeng/message';

// Data Components
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';

// Panel Components
import { TabsModule } from 'primeng/tabs';
import { ToolbarModule } from 'primeng/toolbar';
import { DrawerModule } from 'primeng/drawer';
import { AccordionModule } from 'primeng/accordion';

// Overlay Components
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { ToastModule } from 'primeng/toast';

// Misc Components
import { DividerModule } from 'primeng/divider';
import { BadgeModule } from 'primeng/badge';
import { ChipModule } from 'primeng/chip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProgressBarModule } from 'primeng/progressbar';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ImageModule } from 'primeng/image';

// Services
import { DialogService } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';

const primeNgModules = [
	// Form Components
	ButtonModule,
	InputTextModule,
	InputGroupModule,
	InputGroupAddonModule,
	FloatLabelModule,
	SelectModule,
	CheckboxModule,
	RadioButtonModule,
	ToggleSwitchModule,
	DatePickerModule,
	AutoCompleteModule,
	SliderModule,
	InputOtpModule,

	// Dialog/Overlay Components
	DialogModule,
	DynamicDialogModule,
	TooltipModule,
	MenuModule,
	ToastModule,
	MessageModule,

	// Data Components
	TableModule,
	PaginatorModule,

	// Panel Components
	CardModule,
	TabsModule,
	ToolbarModule,
	DrawerModule,
	AccordionModule,

	// Misc Components
	DividerModule,
	BadgeModule,
	ChipModule,
	ProgressSpinnerModule,
	ProgressBarModule,
	AvatarModule,
	AvatarGroupModule,
	SelectButtonModule,
	ImageModule
];

@NgModule({
	imports: [CommonModule, ...primeNgModules],
	exports: [...primeNgModules],
	providers: [DialogService, MessageService]
})
export class PrimeNgModule {}
