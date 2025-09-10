import { Component, OnDestroy, OnInit } from '@angular/core';
import { fade } from '../../_core/utils/animations.utils';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-home',
    templateUrl: './home.page.html',
    styleUrls: ['./home.page.scss'],
    animations: [fade('fade', 400, '-50%')],
    standalone: false
})
export class HomeComponent implements OnInit, OnDestroy {
	public sampleData;

	constructor(
		private readonly http: HttpClient
	) {}

	async ngOnInit() {
		const data = await this.http.get(environment.apiUrl + '/sample')
			.toPromise()
			.catch((err) => {
				console.log(err);
				return null;
			});

		if(!data) {
			console.error('Failed to query collection');
		}

		this.sampleData = data;
	}

	ngOnDestroy() {

	}
}
