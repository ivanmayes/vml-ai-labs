declare module 'pdf-parse' {
	interface PDFInfo {
		PDFFormatVersion?: string;
		IsAcroFormPresent?: boolean;
		IsXFAPresent?: boolean;
		Title?: string;
		Author?: string;
		Subject?: string;
		Creator?: string;
		Producer?: string;
		CreationDate?: string;
		ModDate?: string;
		[key: string]: unknown;
	}

	interface PDFMetadata {
		_metadata?: Record<string, unknown>;
	}

	interface PDFData {
		numpages: number;
		numrender: number;
		info: PDFInfo;
		metadata: PDFMetadata | null;
		version: string;
		text: string;
	}

	interface PDFOptions {
		pagerender?: (pageData: {
			pageIndex: number;
			getTextContent: () => Promise<unknown>;
		}) => Promise<string>;
		max?: number;
		version?: string;
	}

	function pdfParse(
		dataBuffer: Buffer,
		options?: PDFOptions,
	): Promise<PDFData>;
	export = pdfParse;
}
