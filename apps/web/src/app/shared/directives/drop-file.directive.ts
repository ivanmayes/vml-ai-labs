import { Directive, Output, Input, EventEmitter, HostBinding, HostListener } from '@angular/core';

/**
 * Drop File Directive
 * A directive to enable the user to drag and drop a file onto an area in order to upload the file.
 */
@Directive({
	standalone: false,
    selector: '[appDropFile]',
    
})
export class DropFileDirective {
	@Output() filesDropped = new EventEmitter<any>();

	@HostBinding('class.drag-over') private dragOver = false;

	// Drag Over listener
	@HostListener('dragover', ['$event']) onDragOver(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		this.dragOver = true;
	}

	// Drag Leave listener
	@HostListener('dragleave', ['$event']) public onDragLeave(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		this.dragOver = false;
	}

	// Drop listener
	@HostListener('drop', ['$event']) public ondrop(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		this.dragOver = false;

		const files = ev.dataTransfer.files;
		console.log('Dropped Files', files);
		if (files.length > 0) {
			this.filesDropped.emit(files);
		}
	}
}
