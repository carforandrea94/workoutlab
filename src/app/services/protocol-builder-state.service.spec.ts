import { ProtocolBuilderStateService } from './protocol-builder-state.service';

describe('ProtocolBuilderStateService', () => {
  let service: ProtocolBuilderStateService;

  beforeEach(() => {
    service = new ProtocolBuilderStateService();
  });

  it('editingSubform e saving partono a false', () => {
    expect(service.editingSubform()).toBe(false);
    expect(service.saving()).toBe(false);
  });

  it('requestSaveDraft()/requestSaveActivate() senza handler non lanciano', () => {
    expect(() => service.requestSaveDraft()).not.toThrow();
    expect(() => service.requestSaveActivate()).not.toThrow();
  });

  it('requestSaveDraft() invoca solo l\'handler bozza', () => {
    const draft = vi.fn();
    const activate = vi.fn();
    service.registerHandlers(draft, activate);
    service.requestSaveDraft();
    expect(draft).toHaveBeenCalledTimes(1);
    expect(activate).not.toHaveBeenCalled();
  });

  it('requestSaveActivate() invoca solo l\'handler attiva', () => {
    const draft = vi.fn();
    const activate = vi.fn();
    service.registerHandlers(draft, activate);
    service.requestSaveActivate();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(draft).not.toHaveBeenCalled();
  });

  it('registerHandlers(null, null) rimuove entrambi gli handler', () => {
    const draft = vi.fn();
    const activate = vi.fn();
    service.registerHandlers(draft, activate);
    service.registerHandlers(null, null);
    service.requestSaveDraft();
    service.requestSaveActivate();
    expect(draft).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});
