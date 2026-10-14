import { MeasureCategoryStateService } from './measure-category-state.service';

describe('MeasureCategoryStateService', () => {
  let service: MeasureCategoryStateService;

  beforeEach(() => {
    service = new MeasureCategoryStateService();
  });

  it('saving parte a false', () => {
    expect(service.saving()).toBe(false);
  });

  it('requestSave() senza handler registrato non lancia', () => {
    expect(() => service.requestSave()).not.toThrow();
  });

  it('requestSave() invoca l\'handler registrato', () => {
    const handler = vi.fn();
    service.registerSaveHandler(handler);
    service.requestSave();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('registerSaveHandler(null) rimuove l\'handler', () => {
    const handler = vi.fn();
    service.registerSaveHandler(handler);
    service.registerSaveHandler(null);
    service.requestSave();
    expect(handler).not.toHaveBeenCalled();
  });
});
