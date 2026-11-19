import Database from 'libsql';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const DB_FILENAME = 'aiglorythm.db';

type DatabaseConfig = {
  filename: string;
  options: Database.Options & { authToken?: string };
  isRemote: boolean;
};

function isRemoteDatabaseUrl(value: string) {
  return /^(libsql|https?|wss?):\/\//i.test(value);
}

function resolveLocalDatabasePath() {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  // Local development keeps its data in the repository. Support both the
  // current app/data location and the legacy root data directory.
  const candidates = [
    path.join(process.cwd(), 'app', 'data', DB_FILENAME),
    path.join(process.cwd(), 'data', DB_FILENAME),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function resolveDatabaseConfig(): DatabaseConfig {
  const configuredUrl = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || '').trim();

  if (configuredUrl && isRemoteDatabaseUrl(configuredUrl)) {
    return {
      filename: configuredUrl,
      options: {
        authToken: (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim() || undefined,
      },
      isRemote: true,
    };
  }

  // A production Vercel deployment has a read-only bundle and an ephemeral
  // /tmp. Refuse to start on any local file there instead of surfacing a
  // later ENOENT/EROFS error or silently losing writes.
  if (
    process.env.VERCEL &&
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    throw new Error(
      'No persistent database is configured for this Vercel deployment. ' +
        'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (libSQL/Turso). ' +
        'The Vercel bundle is read-only and /tmp is ephemeral, so DATABASE_PATH and local ' +
        'SQLite files cannot safely store production data. Use DATABASE_PATH only on a ' +
        'self-hosted Node service with a persistent mounted volume.',
    );
  }

  return {
    filename: resolveLocalDatabasePath(),
    options: {},
    isRemote: false,
  };
}

let database: Database.Database | undefined;

export type SiteSetting = { key: string; value: string; updated_at: string };
export type Section = { id:number; page_key:string; section_key:string; title:string; subtitle:string; content:string; image_url:string; cta_label:string; cta_url:string; display_order:number; is_visible:number; status:string; published_at:string | null; updated_at:string };

export function db() {
  if (!database) {
    const config = resolveDatabaseConfig();

    if (!config.isRemote) {
      fs.mkdirSync(path.dirname(config.filename), { recursive: true });
    }

    database = new Database(config.filename, config.options);
    if (config.isRemote) {
      // Turso/libSQL enforces constraints server-side. PRAGMA settings such as
      // journal_mode are only meaningful for a local file connection.
      try {
        database.pragma('foreign_keys = ON');
      } catch {
        // Older libSQL servers may not expose connection pragmas over HTTP.
      }
    } else {
      database.pragma('foreign_keys = ON');
      database.pragma('journal_mode = WAL');
    }
    migrate(database);
    seed(database);
  }
  return database;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin','super_admin')), status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, full_name TEXT NOT NULL DEFAULT '', phone TEXT DEFAULT '', college TEXT DEFAULT '', year TEXT DEFAULT '', branch TEXT DEFAULT '', skills TEXT DEFAULT '', github_url TEXT DEFAULT '', linkedin_url TEXT DEFAULT '', avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS membership_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, college TEXT NOT NULL, current_year TEXT NOT NULL, branch TEXT NOT NULL, interests TEXT NOT NULL, skills TEXT DEFAULT '', github_url TEXT DEFAULT '', linkedin_url TEXT DEFAULT '', motivation TEXT NOT NULL, area_interest TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', admin_notes TEXT DEFAULT '', reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, summary TEXT NOT NULL, description TEXT NOT NULL, banner_url TEXT DEFAULT '', start_at TEXT NOT NULL, end_at TEXT DEFAULT '', venue TEXT NOT NULL, is_online INTEGER NOT NULL DEFAULT 0, meeting_url TEXT DEFAULT '', registration_deadline TEXT DEFAULT '', eligibility TEXT DEFAULT '', schedule_json TEXT DEFAULT '[]', speakers_json TEXT DEFAULT '[]', external_registration_url TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', featured INTEGER NOT NULL DEFAULT 0, capacity INTEGER DEFAULT 0, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS event_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '', college TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(event_id,email)
    );
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, organization TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL, description TEXT NOT NULL, eligibility TEXT DEFAULT '', location TEXT DEFAULT '', deadline TEXT DEFAULT '', application_url TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', featured INTEGER NOT NULL DEFAULT 0, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,opportunity_id)
    );
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL, bio TEXT DEFAULT '', photo_url TEXT DEFAULT '', linkedin_url TEXT DEFAULT '', github_url TEXT DEFAULT '', portfolio_url TEXT DEFAULT '', display_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT DEFAULT '', logo_url TEXT DEFAULT '', website_url TEXT DEFAULT '', display_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT DEFAULT '', quote TEXT NOT NULL, photo_url TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', display_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, link_url TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', publish_at TEXT, expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, mime_type TEXT DEFAULT '', size INTEGER DEFAULT 0, alt_text TEXT DEFAULT '', uploaded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL, organization TEXT DEFAULT '', email TEXT NOT NULL, phone TEXT DEFAULT '', subject TEXT DEFAULT '', message TEXT NOT NULL, partnership_type TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'new', admin_notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS page_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, page_key TEXT NOT NULL, section_key TEXT NOT NULL, title TEXT DEFAULT '', subtitle TEXT DEFAULT '', content TEXT DEFAULT '', image_url TEXT DEFAULT '', cta_label TEXT DEFAULT '', cta_url TEXT DEFAULT '', display_order INTEGER NOT NULL DEFAULT 0, is_visible INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'published', published_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(page_key,section_key)
    );
    CREATE TABLE IF NOT EXISTS content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, changed_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status, deadline);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status, start_at);
    CREATE INDEX IF NOT EXISTS idx_sections_page ON page_sections(page_key, display_order);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);
}

function putSetting(d: Database.Database, key: string, value: string) {
  d.prepare('INSERT OR IGNORE INTO site_settings(key,value) VALUES (?,?)').run(key, value);
}
function seed(d: Database.Database) {
  const count = d.prepare('SELECT count(*) AS n FROM users').get() as {n:number};
  if (!count.n) {
    const email = process.env.ADMIN_EMAIL || 'admin@aiglorythm.org';
    const password = process.env.ADMIN_PASSWORD || 'AlGloryThM@2026!';
    // OR IGNORE makes concurrent cold starts on a fresh database safe: one
    // instance creates the bootstrap administrator, the others keep it.
    const result = d.prepare('INSERT OR IGNORE INTO users(email,password_hash,role,email_verified) VALUES (?,?,?,1)').run(email, bcrypt.hashSync(password, 12), 'super_admin');
    if (result.changes > 0) {
      d.prepare('INSERT INTO profiles(user_id,full_name,bio) VALUES (?,?,?)').run(result.lastInsertRowid, 'AlGloryThM Administrator', 'Initial platform administrator');
    }
  }
  const settings: Record<string,string> = {
    brand_name:'AlGloryThM', tagline:'Where Curiosity Becomes Capability.', logo_url:'/images/aiglorythm-logo.jpeg', favicon_url:'/images/aiglorythm-logo.jpeg',
    accent_color:'#9B6CFF', accent_secondary:'#3F1C8E', site_description:'AlGloryThM is a student-driven technology community empowering the next generation of builders, developers, researchers, and innovators through real-world opportunities, collaborative learning, and meaningful industry exposure.',
    contact_email:'hello@aiglorythm.org', contact_phone:'', contact_address:'Delhi, India', social_linkedin:'', social_github:'', social_instagram:'', social_x:'',
    footer_text:'Built by students who believe capability is practiced, not promised.', nav_json:'[["Home","/"],["About","/about"],["Opportunities","/opportunities"],["Events","/events"],["Community","/join"],["Team","/team"],["Partners","/partners"]]', maintenance_mode:'false', analytics_id:'', seo_title:'AlGloryThM | Where Curiosity Becomes Capability', seo_description:'A student-driven community for builders, developers, researchers and future innovators.', notification_email_enabled:'false'
  };
  Object.entries(settings).forEach(([k,v])=>putSetting(d,k,v));
  const sections = [
    ['home','hero','Where Curiosity Becomes Capability.','A student-driven technology community for builders, developers, researchers, and future innovators.','AlGloryThM turns ambition into practical experience through real-world opportunities, collaborative learning, and meaningful industry exposure.','/images/aiglorythm-logo.jpeg','Join the community','/join',1],
    ['home','mission','Built to move beyond theory.','Learning is stronger when it leads somewhere.','We create focused spaces to learn deeply, build publicly, meet practitioners, and discover paths into technology.','', '', '',2],
    ['home','focus','What we do','Six ways to build capability.','Artificial Intelligence and Machine Learning|Software Development|Cybersecurity|Research and Innovation|Hackathons and Competitions|Developer Community','', '', '',3],
    ['home','impact','Real work. Meaningful momentum.','A community designed for the next step.','Find a learning circle, a build partner, a competition to enter, or a chance to lead. We publish only verified opportunities and community updates.','', 'Explore opportunities','/opportunities',4],
    ['home','leadership','People building the community','Leadership with a builder mindset.','Meet the students shaping programs, conversations, and hands-on experiences.','', 'Meet the team','/team',5],
    ['about','intro','About AlGloryThM','A home for students serious about technology.','AlGloryThM is a student-driven technology community empowering the next generation of builders, developers, researchers, and innovators through real-world opportunities, collaborative learning, and meaningful industry exposure.','', '', '',1],
    ['about','mission','Mission','Make capability accessible.','Create an inclusive, high-trust community where curious students can learn, ship, contribute, and find the people and opportunities that advance their work.','', '', '',2],
    ['about','vision','Vision','Technology leaders who begin by building together.','We imagine a generation of professionals who are technically grounded, generously collaborative, and ready to solve meaningful problems.','', '', '',3],
    ['about','values','Core values','How we work.','Learn in public|Build with purpose|Respect the craft|Make room for others|Keep momentum honest','', '', '',4]
  ] as const;
  const add = d.prepare(`INSERT OR IGNORE INTO page_sections(page_key,section_key,title,subtitle,content,image_url,cta_label,cta_url,display_order,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,'published',CURRENT_TIMESTAMP)`);
  sections.forEach(x=>add.run(...x));
  const oppCount = d.prepare('SELECT count(*) n FROM opportunities').get() as {n:number};
  if(!oppCount.n){
    const creator = (d.prepare('SELECT id FROM users LIMIT 1').get() as {id:number}).id;
    d.prepare('INSERT OR IGNORE INTO opportunities(title,slug,organization,category,summary,description,eligibility,location,deadline,application_url,status,featured,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('Open-source starter sprint','open-source-starter-sprint','AlGloryThM','Open-source','A guided starting point for meaningful first contributions.','A structured community sprint where participants choose a project, learn contribution workflows, and prepare a first pull request. Details are editable from the admin panel.','Open to college students with basic Git familiarity.','Remote','2027-01-15','','published',1,creator);
    d.prepare('INSERT OR IGNORE INTO opportunities(title,slug,organization,category,summary,description,eligibility,location,deadline,application_url,status,featured,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('Research problem circle','research-problem-circle','AlGloryThM','Research programs','Collaborative exploration of practical AI research questions.','An interest-based research circle with reading sessions, peer feedback, and lightweight project proposals. Details will be announced by the organizing team.','Open to active community applicants.','Delhi / Online','2027-02-01','','published',0,creator);
  }
  const eventCount = d.prepare('SELECT count(*) n FROM events').get() as {n:number};
  if(!eventCount.n){
    const creator=(d.prepare('SELECT id FROM users LIMIT 1').get() as {id:number}).id;
    d.prepare('INSERT OR IGNORE INTO events(title,slug,summary,description,start_at,end_at,venue,is_online,registration_deadline,eligibility,schedule_json,speakers_json,status,featured,capacity,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('Build systems that last','build-systems-that-last','A practical conversation on thoughtful software craftsmanship.','A community session on systems thinking, reliable delivery, and how students can develop professional technical habits. Event details are managed from the central admin panel.','2027-01-25T11:00','2027-01-25T13:00','Online',1,'2027-01-23T23:59','Open to college students','[{"time":"11:00","title":"Welcome and context"},{"time":"11:20","title":"Session"},{"time":"12:25","title":"Questions and networking"}]','[]','published',1,200,creator);
  }
}

export function getSettings(): Record<string,string> {
  const rows=db().prepare('SELECT key,value FROM site_settings').all() as {key:string;value:string}[];
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}
export function setSetting(key:string,value:string) { db().prepare('INSERT INTO site_settings(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').run(key,value); }
export function getSections(page:string, all=false): Section[] { return db().prepare(`SELECT * FROM page_sections WHERE page_key=? ${all?'':"AND is_visible=1 AND status='published' AND (published_at IS NULL OR published_at <= CURRENT_TIMESTAMP)"} ORDER BY display_order ASC`).all(page) as Section[]; }
export function slugify(value:string){ return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || `item-${Date.now()}`; }
export function auditVersion(entityType:string,entityId:string,payload:unknown,userId?:number){ db().prepare('INSERT INTO content_versions(entity_type,entity_id,payload,changed_by) VALUES (?,?,?,?)').run(entityType,entityId,JSON.stringify(payload),userId || null); }
