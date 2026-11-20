import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  findByGithubId(githubId: string) {
    return this.repo.findOne({ where: { githubId } });
  }

  /** Same as findByEmail, but also loads the password hash (for login). */
  findByEmailWithPassword(email: string) {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  createLocal(email: string, passwordHash: string) {
    return this.repo.save(this.repo.create({ email, passwordHash, githubId: null }));
  }

  createFromGithub(data: Pick<User, 'email' | 'githubId' | 'name' | 'avatarUrl'>) {
    return this.repo.save(this.repo.create({ ...data, passwordHash: null }));
  }

  save(user: User) {
    return this.repo.save(user);
  }
}
