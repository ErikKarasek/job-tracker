// Who the agents score postings against, built from the résumé (server/cv/content.ts) so the
// fit scores and the CV can never tell two different stories.
import { cv } from '../cv/content'

const en = cv.en
const lines = (items: readonly string[]) => items.map((i) => `  - ${i}`).join('\n')

export const PROFILE = `${en.name}, ${en.city}. ${en.title}.
${en.profile}

Work:
${en.jobs.map((j) => `- ${j.role}, ${j.where} (${j.when})\n${lines(j.points)}`).join('\n')}

Own projects:
${en.projects.map((p) => `- ${p.name}\n${lines(p.points)}`).join('\n')}

Skills:
${en.skills.map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Key technologies: ${en.tech.join(', ')}

Education: ${en.education.map((e) => `${e.what}, ${e.where} (${e.when})`).join('; ')}
${en.other.map(([k, v]) => `${k}: ${v}`).join('. ')}

Looking for: junior roles in software testing / QA, IT support and administration, or junior development and AI automation, around Hradec Králové or remote.`
