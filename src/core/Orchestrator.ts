import { Blackboard } from './Blackboard.js';
import { DesignMove, ExecutableMove, normalizeMoveOutput } from './DesignMove.js';
import { SelectionStrategy, RandomSelectionStrategy } from './SelectionStrategy.js';
import { Fact } from './Fact.js';
import { Bindings } from './Query.js';

/**
 * Represents a single execution log entry.
 */
export interface ExecutionLogEntry {
  moveName: string;
  bindings: Bindings;
  /** Facts added by this move. */
  newFacts: Fact[];
  /** Facts removed by this move (only those actually present on the blackboard). */
  removedFacts: Fact[];
  iteration: number;
  timestamp: number;
}

/**
 * The central control loop that manages the execution of design moves.
 * The orchestrator implements the core ecological generation algorithm:
 * 1. Find all executable moves (filtering)
 * 2. Select which move to execute next (selection)
 * 3. Execute the selected move (execution)
 * 4. Update the blackboard with new facts (update)
 */
export class Orchestrator {
  private _executionLog: ExecutionLogEntry[] = [];
  private _iterationCount: number = 0;
  
  /**
   * Creates a new Orchestrator.
   * @param blackboard - The blackboard to operate on
   * @param designMoves - The design moves available for execution
   * @param selectionStrategy - Strategy for selecting which move to execute
   * @param maxIterations - Maximum number of iterations before stopping
   */
  constructor(
    private blackboard: Blackboard,
    private designMoves: DesignMove[],
    private selectionStrategy: SelectionStrategy = new RandomSelectionStrategy(),
    private maxIterations: number = 1000
  ) {}
  
  /**
   * Gets the execution log.
   */
  get executionLog(): readonly ExecutionLogEntry[] {
    return this._executionLog;
  }
  
  /**
   * Gets the current iteration count.
   */
  get iterationCount(): number {
    return this._iterationCount;
  }
  
  /**
   * Executes one step of the generation process.
   * @returns True if a move was executed, false if no moves available
   */
  step(): boolean {
    // 1. Filtering: Find all executable moves
    const executableMoves: ExecutableMove[] = [];
    
    for (const move of this.designMoves) {
      for (const bindings of move.sensoryQuery(this.blackboard)) {
        executableMoves.push(new ExecutableMove(move, bindings));
      }
    }
    
    if (executableMoves.length === 0) {
      return false; // No moves can be executed
    }
    
    // 2. Selection: Choose which move to execute
    const selectedMove = this.selectionStrategy.select(executableMoves, this.blackboard);
    if (selectedMove === null) {
      return false;
    }
    
    // 3. Execution: Run the selected move
    const { add: newFacts, remove } = normalizeMoveOutput(selectedMove.execute(this.blackboard));
    
    // 4. Update: apply removals, then additions
    const removedFacts = remove.filter(fact => this.blackboard.removeFact(fact));
    this.blackboard.addFacts(newFacts);
    
    // Log the execution
    this._executionLog.push({
      moveName: selectedMove.move.name,
      bindings: selectedMove.bindings,
      newFacts,
      removedFacts,
      iteration: this._iterationCount,
      timestamp: Date.now()
    });
    
    this._iterationCount++;
    
    return true;
  }
  
  /**
   * Runs the generation process until no more moves can be executed or max steps reached.
   * @param maxSteps - Optional override for maximum steps
   * @returns Number of steps executed
   */
  run(maxSteps?: number): number {
    const steps = maxSteps ?? this.maxIterations;
    let executedSteps = 0;
    
    for (let i = 0; i < steps; i++) {
      if (!this.step()) {
        break; // No more executable moves
      }
      executedSteps++;
    }
    
    return executedSteps;
  }
  
  /**
   * Resets the orchestrator state (but not the blackboard).
   */
  reset(): void {
    this._iterationCount = 0;
    this._executionLog = [];
  }
  
  /**
   * Gets a summary of the execution log.
   * @returns Human-readable summary string
   */
  getExecutionSummary(): string {
    const lines: string[] = [
      `Executed ${this._executionLog.length} moves in ${this._iterationCount} iterations:`
    ];
    
    this._executionLog.forEach((entry, index) => {
      const bindingsStr = Object.keys(entry.bindings).length > 0
        ? ` with ${JSON.stringify(entry.bindings)}`
        : '';
      lines.push(
        `  ${index + 1}. ${entry.moveName}${bindingsStr} -> ${entry.newFacts.length} new facts` +
          (entry.removedFacts.length > 0 ? `, ${entry.removedFacts.length} removed` : '')
      );
    });
    
    return lines.join('\n');
  }
  
  /**
   * Gets statistics about move execution.
   * @returns Object with execution statistics
   */
  getExecutionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const entry of this._executionLog) {
      stats[entry.moveName] = (stats[entry.moveName] || 0) + 1;
    }
    
    return stats;
  }
  
  /**
   * Gets the list of available design moves.
   */
  getDesignMoves(): readonly DesignMove[] {
    return this.designMoves;
  }
  
  /**
   * Adds a new design move to the orchestrator.
   * @param move - The design move to add
   */
  addDesignMove(move: DesignMove): void {
    this.designMoves.push(move);
  }
  
  /**
   * Removes a design move from the orchestrator.
   * @param moveName - Name of the move to remove
   * @returns True if move was removed
   */
  removeDesignMove(moveName: string): boolean {
    const index = this.designMoves.findIndex(move => move.name === moveName);
    if (index >= 0) {
      this.designMoves.splice(index, 1);
      return true;
    }
    return false;
  }
}
