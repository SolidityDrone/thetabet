import 'react-native-get-random-values'
import { Buffer } from '@craftzdog/react-native-buffer'

if (typeof global.Buffer === 'undefined') {
  // @ts-expect-error react-native Buffer shim
  global.Buffer = Buffer
}
