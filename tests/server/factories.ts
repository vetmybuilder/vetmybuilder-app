import { randomUUID } from 'node:crypto';

export type ProjectInput = {
  name?: string;
  type?: string;
  location?: string;
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  ownerUserId?: string;
  status?: string;
  createdAt?: string;
};

export function createProject(db: any, overrides: ProjectInput = {}){
  const now = new Date().toISOString();
  const p = {
    name: overrides.name ?? 'Kitchen Renovation',
    type: overrides.type ?? 'renovation',
    location: overrides.location ?? 'Chingford E4',
    description: overrides.description ?? 'Replace units, tiles, electrics',
    propertyType: overrides.propertyType ?? 'house',
    bedrooms: overrides.bedrooms ?? 3,
    ownerUserId: overrides.ownerUserId ?? `user_${randomUUID().slice(0,8)}`,
    status: overrides.status ?? 'pending',
    createdAt: overrides.createdAt ?? now,
  };
  const info = db.prepare(`INSERT INTO projects(name, type, location, description, propertyType, bedrooms, ownerUserId, status, createdAt)
                           VALUES(?,?,?,?,?,?,?,?,?)`).run(
    p.name, p.type, p.location, p.description, p.propertyType, p.bedrooms, p.ownerUserId, p.status, p.createdAt
  );
  const row = db.prepare(`SELECT * FROM projects WHERE id=?`).get(info.lastInsertRowid);
  return row;
}

export function createUserProfile(db: any, params: { userId: string, locationRaw?: string, postcode?: string, postcodeSector?: string, postcodeOutward?: string, city?: string }){
  const now = new Date().toISOString();
  db.prepare(`INSERT OR REPLACE INTO user_profiles(userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt)
              VALUES(@userId, @locationRaw, @postcode, @postcodeSector, @postcodeOutward, @city, @updatedAt)`)
    .run({ updatedAt: now, locationRaw: null, postcode: null, postcodeSector: null, postcodeOutward: null, city: null, ...params });
}

export function createNotification(db: any, params: { userId: string, type?: string, message?: string, projectId?: number|null, linkPath?: string|null }){
  const now = new Date().toISOString();
  const n = {
    userId: params.userId,
    type: params.type ?? 'project_live',
    message: params.message ?? 'A project went live near you',
    projectId: params.projectId ?? null,
    linkPath: params.linkPath ?? null,
    createdAt: now
  };
  db.prepare(`INSERT INTO notifications(userId, type, message, projectId, linkPath, createdAt) VALUES(?,?,?,?,?,?)`)
    .run(n.userId, n.type, n.message, n.projectId, n.linkPath, n.createdAt);
}
