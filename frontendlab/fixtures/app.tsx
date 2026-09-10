// EXP-1 の固定入力。4 transpiler が「同じ土俵」で処理できる機能だけを使う:
//   TS 型注釈の除去 / interface / enum / generics / JSX / optional chaining /
//   nullish 合体 / class fields。decorator・legacy 構文など backend 依存の強い機能は入れない。
// 意味のある分量（現実の 1 コンポーネント程度）にして、桁の比較が観測できるようにする。

interface User {
  id: number;
  name: string;
  email?: string;
  roles: Role[];
}

enum Role {
  Guest = 'guest',
  Member = 'member',
  Admin = 'admin',
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parseUser(raw: unknown): Result<User> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'not an object' };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.name !== 'string') {
    return { ok: false, error: 'missing required fields' };
  }
  const roles = Array.isArray(r.roles) ? (r.roles as Role[]) : [Role.Guest];
  return {
    ok: true,
    value: { id: r.id, name: r.name, email: r.email as string | undefined, roles },
  };
}

class Store<T extends { id: number }> {
  private items = new Map<number, T>();
  private version = 0;

  put(item: T): void {
    this.items.set(item.id, item);
    this.version++;
  }

  get(id: number): T | undefined {
    return this.items.get(id);
  }

  get size(): number {
    return this.items.size;
  }

  snapshot(): T[] {
    return [...this.items.values()];
  }
}

function badge(role: Role): string {
  switch (role) {
    case Role.Admin:
      return '管理者';
    case Role.Member:
      return '会員';
    default:
      return 'ゲスト';
  }
}

interface CardProps {
  user: User;
  onSelect?: (id: number) => void;
}

function UserCard({ user, onSelect }: CardProps) {
  const primary = user.roles?.[0] ?? Role.Guest;
  return (
    <article className="user-card" onClick={() => onSelect?.(user.id)}>
      <header>
        <h3>{user.name}</h3>
        <span className={`badge badge--${primary}`}>{badge(primary)}</span>
      </header>
      <dl>
        <dt>ID</dt>
        <dd>{user.id}</dd>
        <dt>Email</dt>
        <dd>{user.email ?? '—'}</dd>
      </dl>
    </article>
  );
}

interface ListProps {
  store: Store<User>;
  onSelect?: (id: number) => void;
}

function UserList({ store, onSelect }: ListProps) {
  const users = store.snapshot();
  if (users.length === 0) {
    return <p className="empty">利用者がいません。</p>;
  }
  return (
    <section className="user-list" aria-label={`${store.size} 名`}>
      {users.map((u) => (
        <UserCard key={u.id} user={u} onSelect={onSelect} />
      ))}
    </section>
  );
}

export { parseUser, Store, badge, UserCard, UserList, Role };
export type { User, Result, CardProps, ListProps };
