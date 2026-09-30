import { COLORS } from '../game/rules'
import { TankIcon } from './TankIcon'
import styles from './Menu.module.scss'

export function Logo() {
  return (
    <div className={styles.logo} aria-hidden>
      <TankIcon color={COLORS[0]} size={46} />
      <i />
      <TankIcon color={COLORS[1]} size={46} flip />
    </div>
  )
}
