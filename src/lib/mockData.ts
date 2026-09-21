import type { Database } from './types';

// Helpers de fecha para generar un calendario relativo a "hoy".
function atHour(dayOffset: number, hour: number, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}
function plusMinutes(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// SEED — estudio de ejemplo "Zen Studio". CEU de demo: ZEN-2024
// ---------------------------------------------------------------------------

export function seedDatabase(): Database {
  const studioId = 'studio_zen';

  const classTemplates = [
    { id: 'ct_reformer', studioId, name: 'Reformer Flow', durationMin: 50, colorHex: '#2D5A4C' },
    { id: 'ct_mat', studioId, name: 'Mat Pilates', durationMin: 45, colorHex: '#3C7364' },
    { id: 'ct_barre', studioId, name: 'Barre Fusion', durationMin: 55, colorHex: '#7A9B8E' },
    { id: 'ct_prenatal', studioId, name: 'Prenatal', durationMin: 40, colorHex: '#B08968' },
  ];

  // Sesiones para los próximos 7 días (mañana y tarde).
  const classSessions = [];
  let sIdx = 0;
  for (let day = 0; day < 7; day++) {
    const slots = [
      { h: 7, tpl: 'ct_reformer', coach: 'user_coach', cap: 8 },
      { h: 9, tpl: 'ct_mat', coach: 'user_coach', cap: 12 },
      { h: 18, tpl: 'ct_barre', coach: 'user_coach2', cap: 10 },
      { h: 19, tpl: 'ct_reformer', coach: 'user_coach2', cap: 8 },
    ];
    for (const slot of slots) {
      const startsAt = atHour(day, slot.h);
      const tpl = classTemplates.find((t) => t.id === slot.tpl)!;
      classSessions.push({
        id: `cs_${sIdx++}`,
        studioId,
        templateId: slot.tpl,
        coachId: slot.coach,
        startsAt,
        endsAt: plusMinutes(startsAt, tpl.durationMin),
        capacity: slot.cap,
        recurring: true,
      });
    }
  }

  const db: Database = {
    studios: [
      {
        id: studioId,
        name: 'Zen Studio Pilates',
        ceuCode: 'ZEN-2024',
        phone: '52 55 1234 5678',
        email: 'hola@zenstudio.mx',
        address: 'Av. Reforma 123, CDMX',
        photos: [],
        branding: {
          primaryColor: '#2D5A4C',
          secondaryColor: '#F4F1EA',
          accentColor: '#333333',
          fontFamily: 'Inter',
          logoText: 'Zen Studio',
        },
        services: [
          { id: 'sv_nutrition', name: 'Nutrición', description: 'Planes de alimentación y seguimiento con nutriólogo.', enabled: true, custom: false },
          { id: 'sv_kinesiology', name: 'Kinesiología', description: 'Rehabilitación, movilidad y prevención de lesiones.', enabled: true, custom: false },
          { id: 'sv_sportsmed', name: 'Medicina Deportiva', description: 'Valoración médica y optimización del rendimiento.', enabled: false, custom: false },
        ],
        whatsapp: {
          number: '525512345678',
          botEnabled: true,
          templates: [
            { id: 'wt_pay', label: 'Recordatorio de pago', text: 'Hola {nombre} 👋, te recordamos que tu plan {plan} vence el {fecha}. Puedes renovar en el estudio o en línea. ¡Te esperamos!' },
            { id: 'wt_class', label: 'Recordatorio de clase', text: 'Hola {nombre}, tu clase de {clase} es {fecha} a las {hora}. ¡Nos vemos en el mat! 🧘' },
            { id: 'wt_welcome', label: 'Bienvenida', text: '¡Bienvenido a {estudio}, {nombre}! Estamos felices de que te unas. Cualquier duda, escríbenos por aquí.' },
            { id: 'wt_promo', label: 'Promoción', text: '{nombre}, esta semana tenemos 2x1 en clases de Reformer. Responde este mensaje para apartar tu lugar.' },
          ],
          knowledge: [
            'Horario: lunes a sábado de 7:00 a 21:00.',
            'Aceptamos pago en efectivo, tarjeta y transferencia.',
            'La primera clase de prueba es gratis.',
            'Las reservas se cancelan hasta 4 horas antes sin penalización.',
          ],
        },
        subscription: {
          status: 'TRIALING',
          plan: 'premium',
          priceUsd: 84.99,
          promoPriceUsd: 1,
          trialDays: 14,
          isPromo: true,
          trialEndsAt: inDays(11),
          currentPeriodEnd: inDays(11),
        },
      },
    ],
    users: [
      { id: 'user_admin', studioId, role: 'STUDIO_ADMIN', fullName: 'Ana Torres', email: 'ana@zenstudio.mx', phone: '52 55 1111 2222', avatarInitials: 'AT', createdAt: daysAgo(120) },
      {
        id: 'user_coach', studioId, role: 'COACH', fullName: 'Marco Ríos', email: 'marco@zenstudio.mx', phone: '52 55 3333 4444', avatarInitials: 'MR', createdAt: daysAgo(90),
        coachStatus: 'APPROVED',
        coachProfile: { bio: 'Instructor certificado en Reformer y Mat con enfoque en rehabilitación postural.', specialties: ['Reformer', 'Mat', 'Rehabilitación'], yearsExp: 8 },
      },
      {
        id: 'user_coach2', studioId, role: 'COACH', fullName: 'Lucía Fernández', email: 'lucia@zenstudio.mx', phone: '52 55 5555 6666', avatarInitials: 'LF', createdAt: daysAgo(60),
        coachStatus: 'APPROVED',
        coachProfile: { bio: 'Especialista en Barre Fusion y entrenamiento prenatal.', specialties: ['Barre', 'Prenatal'], yearsExp: 5 },
      },
      {
        id: 'user_coach3', studioId, role: 'COACH', fullName: 'Pablo Núñez', email: 'pablo@zenstudio.mx', phone: '52 55 7777 1212', avatarInitials: 'PN', createdAt: daysAgo(5),
        coachStatus: 'PENDING',
        coachProfile: { bio: 'Instructor junior, recién egresado de certificación Mat.', specialties: ['Mat'], yearsExp: 1 },
      },
      { id: 'user_student', studioId, role: 'STUDENT', fullName: 'Sofía Méndez', email: 'sofia@example.com', phone: '52 55 8888 9999', avatarInitials: 'SM', createdAt: daysAgo(10) },
      { id: 'user_student2', studioId, role: 'STUDENT', fullName: 'Diego Luna', email: 'diego@example.com', phone: '52 55 2020 3030', avatarInitials: 'DL', createdAt: daysAgo(7) },
      { id: 'user_student3', studioId, role: 'STUDENT', fullName: 'Valeria Cruz', email: 'valeria@example.com', phone: '52 55 4040 5050', avatarInitials: 'VC', createdAt: daysAgo(3) },
    ],
    packages: [
      { id: 'pkg_starter', studioId, name: 'Starter · 4 clases', description: 'Ideal para comenzar. 4 clases a elegir dentro del mes.', priceUsd: 60, classCredits: 4, validityDays: 30, active: true, eligibleClassIds: ['ct_reformer', 'ct_mat'] },
      { id: 'pkg_flow', studioId, name: 'Flow · 8 clases', description: 'El favorito. 8 clases con acceso a Reformer, Mat y Barre.', priceUsd: 110, classCredits: 8, validityDays: 45, active: true, eligibleClassIds: ['ct_reformer', 'ct_mat', 'ct_barre'] },
      { id: 'pkg_unlimited', studioId, name: 'Zen Ilimitado', description: 'Clases ilimitadas por 30 días. Todas las disciplinas.', priceUsd: 180, classCredits: 40, validityDays: 30, active: true, eligibleClassIds: ['ct_reformer', 'ct_mat', 'ct_barre', 'ct_prenatal'] },
    ],
    userPackages: [
      { id: 'up_1', userId: 'user_student', packageId: 'pkg_flow', creditsTotal: 8, creditsUsed: 3, purchasedAt: daysAgo(10), expiresAt: inDays(35), active: true },
      { id: 'up_2', userId: 'user_student2', packageId: 'pkg_starter', creditsTotal: 4, creditsUsed: 3, purchasedAt: daysAgo(25), expiresAt: inDays(5), active: true },
      { id: 'up_3', userId: 'user_student3', packageId: 'pkg_starter', creditsTotal: 4, creditsUsed: 4, purchasedAt: daysAgo(40), expiresAt: daysAgo(10), active: true },
    ],
    classTemplates,
    classSessions,
    bookings: [
      { id: 'bk_1', userId: 'user_student', sessionId: 'cs_0', userPackageId: 'up_1', status: 'RESERVED', createdAt: daysAgo(1) },
      { id: 'bk_2', userId: 'user_student2', sessionId: 'cs_0', userPackageId: 'up_2', status: 'RESERVED', createdAt: daysAgo(1) },
      { id: 'bk_3', userId: 'user_student2', sessionId: 'cs_1', userPackageId: 'up_2', status: 'RESERVED', createdAt: daysAgo(1) },
    ],
    payments: [
      { id: 'pay_1', userId: 'user_student', amountUsd: 110, method: 'card', packageId: 'pkg_flow', concept: 'Flow · 8 clases', paidAt: daysAgo(10), registeredBy: 'online' },
      { id: 'pay_2', userId: 'user_student2', amountUsd: 60, method: 'cash', packageId: 'pkg_starter', concept: 'Starter · 4 clases', paidAt: daysAgo(25), registeredBy: 'studio' },
      { id: 'pay_3', userId: 'user_student3', amountUsd: 60, method: 'transfer', packageId: 'pkg_starter', concept: 'Starter · 4 clases', paidAt: daysAgo(40), registeredBy: 'studio' },
    ],
    stars: [
      { id: 'st_1', userId: 'user_student', delta: 1, reason: 'attendance', createdAt: daysAgo(9) },
      { id: 'st_2', userId: 'user_student', delta: 1, reason: 'attendance', createdAt: daysAgo(6) },
      { id: 'st_3', userId: 'user_student', delta: 1, reason: 'attendance', createdAt: daysAgo(3) },
      { id: 'st_4', userId: 'user_student', delta: 2, reason: 'bonus', createdAt: daysAgo(2) },
    ],
    rewards: [
      { id: 'rw_1', studioId, name: 'Clase de regalo', description: 'Una clase gratis para ti o un invitado.', starCost: 10, active: true },
      { id: 'rw_2', studioId, name: 'Botella Move yA', description: 'Botella térmica de edición limitada.', starCost: 15, active: true },
      { id: 'rw_3', studioId, name: 'Sesión de Nutrición', description: 'Consulta 1:1 con nuestro nutriólogo.', starCost: 25, active: true },
    ],
    goals: [
      { id: 'goal_1', userId: 'user_student', title: 'Asistir 12 clases este mes', targetValue: 12, currentValue: 3, periodEnd: inDays(20), achieved: false },
      { id: 'goal_2', userId: 'user_student', title: 'Racha de 3 semanas', targetValue: 3, currentValue: 2, periodEnd: inDays(7), achieved: false },
    ],
    classGuests: [],
  };

  return db;
}
