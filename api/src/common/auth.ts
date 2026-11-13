import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DbService } from '../db/db.service';

export type Role = 'citoyen' | 'agent' | 'admin';
export interface Utilisateur { id: string; role: Role; email: string; }

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Utilisateur =>
  ctx.switchToHttp().getRequest().user);

/** Vérifie le jeton, recharge le compte (compte désactivé = refusé) puis contrôle le rôle côté serveur. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private db: DbService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', cibles)) return true;
    const req = ctx.switchToHttp().getRequest();
    const h: string | undefined = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new UnauthorizedException('Connexion requise');
    let payload: { sub: string };
    try { payload = await this.jwt.verifyAsync(h.slice(7)); } catch { throw new UnauthorizedException('Session expirée'); }
    const c = await this.db.one('SELECT id, role, email, actif FROM comptes WHERE id = $1', [payload.sub]);
    if (!c || !c.actif) throw new UnauthorizedException('Compte indisponible');
    req.user = { id: c.id, role: c.role, email: c.email } as Utilisateur;
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', cibles);
    if (roles && !roles.includes(c.role)) throw new ForbiddenException('Action non autorisée pour ce profil');
    return true;
  }
}
