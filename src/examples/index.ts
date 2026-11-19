// The six bundled example cards, in stack order (design.md §3.2). Description
// and script are `?raw` imports of the spec's examples directory, so the app
// ships those exact bytes and there is no third copy to drift.
import countdownDescription from '../../.kiro/specs/flip-card/examples/countdown.hc/description.txt?raw'
import countdownScript from '../../.kiro/specs/flip-card/examples/countdown.hc/script.hc?raw'
import counterDescription from '../../.kiro/specs/flip-card/examples/counter.hc/description.txt?raw'
import counterScript from '../../.kiro/specs/flip-card/examples/counter.hc/script.hc?raw'
import dateStampDescription from '../../.kiro/specs/flip-card/examples/date-stamp.hc/description.txt?raw'
import dateStampScript from '../../.kiro/specs/flip-card/examples/date-stamp.hc/script.hc?raw'
import greeterDescription from '../../.kiro/specs/flip-card/examples/greeter.hc/description.txt?raw'
import greeterScript from '../../.kiro/specs/flip-card/examples/greeter.hc/script.hc?raw'
import helloDescription from '../../.kiro/specs/flip-card/examples/hello.hc/description.txt?raw'
import helloScript from '../../.kiro/specs/flip-card/examples/hello.hc/script.hc?raw'
import quizDescription from '../../.kiro/specs/flip-card/examples/quiz.hc/description.txt?raw'
import quizScript from '../../.kiro/specs/flip-card/examples/quiz.hc/script.hc?raw'
import type { Example, ExampleObject } from './types'

export type { Example, ExampleObject } from './types'

const field = (name: string, x: number, y: number, w: number, h: number): ExampleObject => ({
  kind: 'field',
  name,
  visible: true,
  text: '',
  rect: { x, y, w, h },
})

const button = (name: string, x: number, y: number, w: number, h: number): ExampleObject => ({
  kind: 'button',
  name,
  visible: true,
  enabled: true,
  rect: { x, y, w, h },
})

export const EXAMPLES: readonly Example[] = [
  {
    id: 'hello',
    title: 'Hello',
    description: helloDescription,
    script: helloScript,
    objects: [field('greeting', 32, 40, 448, 60)],
  },
  {
    id: 'counter',
    title: 'Counter',
    description: counterDescription,
    script: counterScript,
    objects: [field('count', 32, 40, 200, 40), button('Increment', 32, 100, 160, 32)],
  },
  {
    id: 'date-stamp',
    title: 'Date stamp',
    description: dateStampDescription,
    script: dateStampScript,
    objects: [field('stamp', 32, 40, 300, 40), button('Stamp', 32, 100, 160, 32)],
  },
  {
    id: 'greeter',
    title: 'Greeter',
    description: greeterDescription,
    script: greeterScript,
    objects: [field('name', 32, 40, 300, 40), button('Greet', 32, 100, 160, 32)],
  },
  {
    id: 'countdown',
    title: 'Countdown',
    description: countdownDescription,
    script: countdownScript,
    objects: [field('list', 32, 40, 200, 260), button('Go', 260, 40, 120, 32)],
  },
  {
    id: 'quiz',
    title: 'Quiz',
    description: quizDescription,
    script: quizScript,
    objects: [field('question', 32, 40, 448, 40), field('answer', 32, 100, 200, 40), button('Check', 260, 100, 120, 32)],
  },
]

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((example) => example.id === id)
}
