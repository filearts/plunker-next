var stream = require("stream")
  , util = require("util");
  

var module = angular.module("plunker.service.ottext", [
  "plunker.service.textops"
]);

module.factory("otuser",
  [function(){
    
  }]
);

module.factory("ottext",
  ["$rootScope", "$q", "$timeout", "textops", "otuser", function($rootScope, $q, $timeout, textops, otuser){
    util.inherits(OTText, stream.Duplex);
    
    /**
     * Interface for enabling OT text bindings on a Firebase reference
     *
     */
    function OTText(ref, options) {
      stream.Duplex.call(this, options);
      
      this.id = ref.name();
      this.ref = ref;
      this.revisionsRef = ref.child("revisions");
      this.checkpointRef = ref.child("snapshots");
      
      // Flag to get around the fact that Firebase will fire 'child_added' events for local adds
      this.isLocalEvent = false;
      this.isFlushing = false;
      
      // Frequency (number of revisions) that a milestone will be created
      this.checkpointFrequency = 5;
      this.nextRevisionNum = 0;
      this.initialized;
      
      // A queue of pending local operations
      this.pendingOp = [];
      
      this.otuser = otuser;
      
      // Create some scopes that we'll use as event busses.
      this.$events = $rootScope.$new();
      this.$localEvents = this.$events.$new();
      this.$remoteEvents = this.$events.$new();
      
      this.$localEvents.$on("textInsert", function (e, op) {
        
      });
    }
    
    OTText.prototype = {
      _read: function(size) {
        
      },
      _write: function(chunk, encoding, next) {
        // Take events coming from the local instance and queue them for Firebase
        this.queueOperation(chunk);
        
        // No need to defer the next call... buffer events in ottext
        next(); 
      },
      init: function() {
        console.log("ottext:init");
        var ottext = this;
        
        return ottext.initialized || (ottext.initialized = this.getRemoteState().then(function (state) {
          console.log("ottext:init:inited", state);
          ottext.nextRevisionNum = revisionFromId(state.nextRevId);
          ottext.val = state.val;
          
          ottext.revisionsRef.startAt(null, revisionToId(ottext.nextRevisionNum)).on("child_added", function (snapshot) {
            console.log("ottext:init:revision", snapshot.name(), snapshot.val(), ottext.isLocalEvent);
            
            $rootScope.$evalAsync(ottext.flushPendingOp.bind(ottext));
            
            // Ignore events originating locally
            if (ottext.isLocalEvent)  {
              // Record milestone
              if (ottext.nextRevisionNum > 0 && 0 === (ottext.nextRevisionNum % ottext.checkpointFrequency)) {
                ottext.checkpointRef.set({
                  val: ottext.val,
                  revId: revisionToId(ottext.nextRevisionNum - 1)
                })
              }
            } else {
              var revision = snapshot.val();
              
              // Update local state
              ottext.nextRevisionNum++;
              ottext.val = textops.apply(ottext.val, revision.op);
              
              // Push the operation to the Duplex stream
              ottext.push({
                type: "text",
                val: ottext.val,
                rev: ottext.nextRevisionNum - 1,
                source: ottext.id,
                op: revision.op
              });
            }
          });
        }));
      },
      
      /**
       * Record an operation in the oplog
       * 
       * To apply an operation, we need to make sure that no remote operation
       * was applied at the same time at the same refId. To prevent this, we use
       * Firebase's transaction support to prevent adding the op if this
       * happened. If that happened, we need to queue the operation for later.
       */
      applyOperation: function (operation) {
        console.log("ottext:applyOperation", operation);
        
        var ottext = this
          , revisionsRef = this.revisionsRef;
        
        return ottext.init().then(function () {
          console.log("ottext:applyOperation:inited");
          
          var dfd = $q.defer()
            , revId = revisionToId(ottext.nextRevisionNum)
            , revision = {op: operation};
          
          // Use Firebase transactions to make sure that the operation does not
          // overwrite the operation added by a different user
          ottext.isLocalEvent = true;
          revisionsRef.child(revId).transaction(function (current) {
            console.log("ottext:applyOperation:transaction", current);
            // Only apply the revision if no one else has created it
            if (null === current) {
              return revision;
            }
          }, function (err, committed, snapshot) {
            console.log("ottext:applyOperation:transaction:completed", err, committed, snapshot.val());
            
            if (committed) {
              ottext.nextRevisionNum++;
              ottext.val = textops.apply(ottext.val, operation);
              
              for (var i = 0; i < operation.length; i++) {
                var component = operation[i];
                
                if (component.i) {
                  ottext.$localEvents.$emit("textInsert", ottext.val, ottext.nextRevisionNum - 1, [component]);
                } else if (component.d) {
                  ottext.$localEvents.$emit("textRemove", ottext.val, ottext.nextRevisionNum - 1, [component]);
                }
              }
              
              ottext.$localEvents.$emit("textChange", ottext.val, ottext.nextRevisionNum - 1, operation);
              
              dfd.resolve(ottext.nextRevisionNum - 1);
            } else {
              dfd.reject(ottext.nextRevisionNum - 1);
            }
            
            ottext.isLocalEvent = false;
            
          }, false);
          
          return dfd.promise;
        });
      },
      
      queueOperation: function(operation) {
        console.log("ottext:queueOperation", operation);
        
        var ottext = this;
        
        // We use angular.copy to ensure referential integrity for the pending
        // operations queue
        angular.copy(this.ot.compose(this.pendingOp, operation), this.pendingOp);
        
        
        this.pendingOpDfd = this.pendingOpDfd || $q.defer();
        
        // Request that the operation queue be flushed on nextTick
        $rootScope.$evalAsync(ottext.flushPendingOp.bind(ottext));
        
        return this.pendingOpDfd.promise;
      },
      
      /**
       * Flush the pending operation to the server
       */
      flushPendingOp: function () {
        console.log("ottext:flushPendingOp", this.isFlushing, this.pendingOp);
        
        var ottext = this
          , revisionsRef = this.revisionsRef
          , dfd = $q.defer();
        
        if (!ottext.pendingOp.length) {
          console.log("ottext:flushPendingOp:empty");
          
          return $q.when(ottext.nextRevisionNum);
        }

        return $q.all(ottext.init(), ottext.flushing).then(function() {
          console.log("ottext:flushPendingOp:inited");
          
          if (!ottext.pendingOp.length) {
            return true
          }
          
          ottext.inFlightOp = angular.copy(ottext.pendingOp);
          ottext.pendingOp.length = 0;
          
          ottext.flushing = ottext.applyOperation(ottext.inFlightOp).then(function(revNum) {
            console.log("ottext:flushPendingOp:applyOperation");
            if (ottext.pendingOpDfd) {
              ottext.pendingOpDfd.resolve(revNum);
              ottext.pendingOpDfd = null;
            }
            
            ottext.pendingOp.length = 0;
            
            return revNum;
          });
          
          ottext.flushing.finally(function() {
            ottext.flushing = null;
          });
          
          return ottext.flushing;
        });
      },
      
      getVersionId: function() {
        return this.getVersionNum(function(revNum) {
          return revisionToId(revNum);
        });
      },
      
      getVersionNum: function() {
        var ottext = this;
        
        return this.init().then(function() {
          return ottext.nextRevisionNum - 1;
        });
      },
      
      /**
       * Get a snapshot object of the current state
       * 
       * @returns Promise that resolves to the value of the file
       */
      getRemoteState: function() {
        var ot = this.ot //TODO
          , ottext = this;
          
        var revisionsRef = this.revisionsRef
          , checkpointRef = this.checkpointRef;
        
        return getFirebaseValue(checkpointRef).then(function(checkpoint){
          var nextRevision = 0
            , remoteVal = ot.create()
            , trailingRevisionsRef = revisionsRef;
          
          // A checkpoint was saved
          if (checkpoint && checkpoint.val && checkpoint.opId) {
            nextRevision = revisionFromId(checkpoint.opId) + 1;
            remoteVal = checkpoint.val;

            // Filter the trailing revisions to those after the last checkpoint
            trailingRevisionsRef = trailingRevisionsRef.startAt(null, revisionToId(nextRevision));
          }

          return getFirebaseValue(trailingRevisionsRef).then(function (revisions) {
            console.log("revisions", revisions);
            
            _.each(revisions, function(revision, revId) {
              remoteVal = ot.apply(remoteVal, revision.op);
              nextRevision++;
            });
            
            return {
              nextRevId: revisionToId(nextRevision),
              val: remoteVal
            };
          });
        });
      }
    };
    
    function getFirebaseSnapshot(ref) {
      var dfd = $q.defer();
      
      ref.once("value", dfd.resolve);
      
      return dfd.promise;
    }
    
    function getFirebaseValue(ref) {
      return getFirebaseSnapshot(ref).then(function (snapshot) {
        return snapshot.val();
      });
    }

    /**
     * Source: https://github.com/firebase/firepad/blob/master/lib/firebase-adapter.js
     * 
     */
    var characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    function revisionToId(revision) {
      if (revision === 0) {
        return 'A0';
      }
  
      var str = '';
      while (revision > 0) {
        var digit = (revision % characters.length);
        str = characters[digit] + str;
        revision -= digit;
        revision /= characters.length;
      }
  
      // Prefix with length (starting at 'A' for length 1) to ensure the id's sort lexicographically.
      var prefix = characters[str.length + 9];
      return prefix + str;
    }
  
    function revisionFromId(revisionId) {
      var revision = 0;
      for(var i = 1; i < revisionId.length; i++) {
        revision *= characters.length;
        revision += characters.indexOf(revisionId[i]);
      }
      return revision;
    }

    return {
      createStream: function(path, options){
        options || (options = {
          
        })
      },
      connect: function (fileId) {
        return new OTText(new Firebase("https://cocode.firebaseio.com/" + fileId));
      }
    };
  }]
);