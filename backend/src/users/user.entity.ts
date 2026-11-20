import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  /** null for accounts created via OAuth only. Never selected by default. */
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  githubId: string | null;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  avatarUrl: u.avatarUrl,
});
