import { POLYGON_RPC_URL } from '@/config/chains'
import { THETA_DEPLOYMENT } from '@/config/contracts.generated'

const getChainsConfig = () => {
  return {
    polygon: {
      chainId: 137,
      blockchain: 'polygon',
      provider: POLYGON_RPC_URL,
      transferMaxFee: 5000000,
      paymasterToken: {
        address: THETA_DEPLOYMENT.betToken,
      },
    },
  }
}

export default getChainsConfig
