import { Blackboard } from './Blackboard';
import { DesignMove } from './DesignMove';
import { SelectionStrategy, RandomSelectionStrategy } from './SelectionStrategy';
import { Orchestrator, ExecutionLogEntry } from './Orchestrator';
import { Fact } from './Fact';

/**
 * Function type for rendering a blackboard state.
 */
export type Renderer<T> = (blackboard: Blackboard) => T;

/**
 * Main interface for the Ecological Generative System.
 * Provides a high-level API for ecological generation with:
 * - Design move management
 * - Initial fact seeding
 * - Generation execution
 * - Result rendering
 */
export class EcologicalGenerator {
  private _blackboard: Blackboard;
  private _designMoves: DesignMove[] = [];
  private _orchestrator: Orchestrator | null = null;
  
  /**
   * Creates a new EcologicalGenerator.
   * @param selectionStrategy - Strategy for selecting which move to execute
   */
  constructor(
    private selectionStrategy: SelectionStrategy = new RandomSelectionStrategy()
  ) {
    this._blackboard = new Blackboard();
  }
  
  /**
   * Gets the current blackboard state.
   */
  get blackboard(): Blackboard {
    return this._blackboard;
  }
  
  /**
   * Gets the current orchestrator, if generation has been started.
   */
  get orchestrator(): Orchestrator | null {
    return this._orchestrator;
  }
  
  /**
   * Gets the list of design moves.
   */
  get designMoves(): readonly DesignMove[] {
    return this._designMoves;
  }
  
  /**
   * Adds a design move to the system.
   * @param move - The design move to add
   */
  addDesignMove(move: DesignMove): void {
    this._designMoves.push(move);
    
    // If orchestrator exists, add to it as well
    if (this._orchestrator) {
      this._orchestrator.addDesignMove(move);
    }
  }
  
  /**
   * Adds multiple design moves to the system.
   * @param moves - Array of design moves to add
   */
  addDesignMoves(moves: DesignMove[]): void {
    moves.forEach(move => this.addDesignMove(move));
  }
  
  /**
   * Removes a design move from the system.
   * @param moveName - Name of the move to remove
   * @returns True if move was removed
   */
  removeDesignMove(moveName: string): boolean {
    const index = this._designMoves.findIndex(move => move.name === moveName);
    if (index >= 0) {
      this._designMoves.splice(index, 1);
      
      // If orchestrator exists, remove from it as well
      if (this._orchestrator) {
        this._orchestrator.removeDesignMove(moveName);
      }
      
      return true;
    }
    return false;
  }
  
  /**
   * Adds initial facts to seed the generation process.
   * @param facts - Array of facts to add
   */
  addInitialFacts(facts: Fact[]): void {
    this._blackboard.addFacts(facts);
  }
  
  /**
   * Adds a single initial fact.
   * @param fact - The fact to add
   */
  addInitialFact(fact: Fact): void {
    this._blackboard.addFact(fact);
  }
  
  /**
   * Runs the generation process and returns the final blackboard state.
   * @param maxSteps - Maximum number of steps to execute
   * @returns The final blackboard state
   */
  generate(maxSteps?: number): Blackboard {
    this._orchestrator = new Orchestrator(
      this._blackboard,
      [...this._designMoves], // Copy to allow dynamic modification
      this.selectionStrategy,
      maxSteps ?? 1000
    );
    
    this._orchestrator.run(maxSteps);
    return this._blackboard;
  }
  
  /**
   * Executes a single generation step.
   * @returns True if a move was executed, false if no moves available
   */
  step(): boolean {
    if (this._orchestrator === null) {
      this._orchestrator = new Orchestrator(
        this._blackboard,
        [...this._designMoves],
        this.selectionStrategy
      );
    }
    
    return this._orchestrator.step();
  }
  
  /**
   * Resets the entire system.
   * Clears the blackboard and resets the orchestrator.
   */
  reset(): void {
    this._blackboard.clear();
    if (this._orchestrator) {
      this._orchestrator.reset();
    }
    this._orchestrator = null;
  }
  
  /**
   * Gets facts from the blackboard.
   * @param predicate - Optional predicate to filter by
   * @returns Array of facts
   */
  getFacts(predicate?: string): Fact[] {
    return this._blackboard.getFacts(predicate);
  }
  
  /**
   * Applies a renderer function to the current blackboard state.
   * @param renderer - Function to transform blackboard into desired output
   * @returns The rendered result
   */
  render<T>(renderer: Renderer<T>): T {
    return renderer(this._blackboard);
  }
  
  /**
   * Creates a snapshot of the current generator state.
   * Useful for saving/loading or creating checkpoints.
   * @returns Object containing the current state
   */
  snapshot(): {
    blackboard: Fact[];
    designMoves: string[];
    executionLog?: readonly ExecutionLogEntry[];
  } {
    return {
      blackboard: this._blackboard.getFacts(),
      designMoves: this._designMoves.map(move => move.name),
      executionLog: this._orchestrator?.executionLog
    };
  }
  
  /**
   * Gets execution statistics if generation has been run.
   * @returns Execution statistics or null
   */
  getExecutionStats(): Record<string, number> | null {
    return this._orchestrator?.getExecutionStats() ?? null;
  }
  
  /**
   * Gets execution summary if generation has been run.
   * @returns Execution summary string or null
   */
  getExecutionSummary(): string | null {
    return this._orchestrator?.getExecutionSummary() ?? null;
  }
}
