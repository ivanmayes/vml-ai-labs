export type WordRule = 'whitespace' | 'alphanumeric';
export type TargetUnit = 'characters' | 'words';

export interface TextCounterTarget {
	enabled: boolean;
	unit: TargetUnit;
	value: number;
}

export interface TextCounterSettings {
	countWhitespaceAsCharacter: boolean;
	countLineBreaksAsCharacter: boolean;
	wordRule: WordRule;
	showSentences: boolean;
	showParagraphs: boolean;
	showReadingTime: boolean;
	showSpeakingTime: boolean;
	readingWpm: number;
	speakingWpm: number;
	target: TextCounterTarget;
}

export interface TextStats {
	characters: number;
	words: number;
	lines: number;
	sentences: number;
	paragraphs: number;
	readingTimeMinutes: number;
	speakingTimeMinutes: number;
	overTarget: boolean;
}
