import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { GlobalQuery } from '../../../state/global/global.query';
import { ThemeService } from '../../services/theme.service';
import { SidebarService, NavItem } from '../../services/sidebar.service';
import type { PublicUser } from '../../../../../../api/src/user/user.entity';
import { GlobalSettings } from '../../../state/global/global.model';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: false
})
export class SidebarComponent implements OnInit {
  user$: Observable<PublicUser>;
  settings$: Observable<GlobalSettings>;
  userMenuItems: MenuItem[];

  constructor(
    public sidebarService: SidebarService,
    public themeService: ThemeService,
    private sessionQuery: SessionQuery,
    private sessionService: SessionService,
    private globalQuery: GlobalQuery,
    private router: Router
  ) {
    this.user$ = this.sessionQuery.select('user');
    this.settings$ = this.globalQuery.select('settings');
  }

  ngOnInit(): void {
    this.userMenuItems = [
      {
        label: 'Logout',
        icon: 'pi pi-sign-out',
        command: () => this.logout()
      }
    ];
  }

  handleItemClick(item: NavItem): void {
    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  logout(): void {
    this.sessionService.logout();
    this.router.navigate(['/login']);
  }

  getUserInitial(user: PublicUser): string {
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'U';
  }

  isActiveRoute(route: string): boolean {
    return this.router.url === route || this.router.url.startsWith(route + '/');
  }
}
