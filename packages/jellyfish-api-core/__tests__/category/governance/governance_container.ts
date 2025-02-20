import { MasterNodeRegTestContainer, StartOptions } from '@defichain/testcontainers'

export class GovernanceMasterNodeRegTestContainer extends MasterNodeRegTestContainer {
  constructor () {
    super(undefined, 'defi/defichain:master-bcce2b47e')
  }

  /**
   * Temporary remove invalid flag and configure it for development branch
   */
  protected getCmd (opts: StartOptions): string[] {
    const cmd = super.getCmd(opts)
      .filter(cmd => cmd !== '-eunospayaheight=7')
      .filter(cmd => cmd !== '-fortcanningheight=8')
      .filter(cmd => cmd !== '-fortcanningmuseumheight=9')
      .filter(cmd => cmd !== '-fortcanninghillheight=10')
      .filter(cmd => cmd !== '-fortcanningroadheight=11')

    return [
      ...cmd,
      '-fortcanningheight=20'
    ]
  }
}
