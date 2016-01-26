/*************************************************
 * Copyright (c) 2015 Ansible, Inc.
 *
 * All Rights Reserved
 *************************************************/

/**
 * @ngdoc function
 * @name controllers.function:Users
 * @description This controller's the Users page
*/


export function UsersList($scope, $rootScope, $location, $log, $stateParams,
    Rest, Alert, UserList, GenerateList, Prompt, SearchInit, PaginateInit,
    ReturnToCaller, ClearScope, ProcessErrors, GetBasePath, SelectionInit,
    Wait, Stream, $state, Refresh) {

    ClearScope();

    var list = UserList,
        defaultUrl = GetBasePath('users'),
        generator = GenerateList,
        base = $location.path().replace(/^\//, '').split('/')[0],
        mode = (base === 'users') ? 'edit' : 'select',
        url = (base === 'organizations') ? GetBasePath('organizations') + $stateParams.organization_id + '/users/' :
            GetBasePath('teams') + $stateParams.team_id + '/users/';

    var injectForm = function() {
        generator.inject(UserList, { mode: mode, scope: $scope });
    };

    injectForm();

    $scope.$on("RefreshUsersList", function() {
        injectForm();
        Refresh({
            scope: $scope,
            set: 'users',
            iterator: 'user',
            url: GetBasePath('users') + "?order_by=username&page_size=" + $scope.user_page_size
        });
    });

    $scope.selected = [];

    if (mode === 'select') {
        SelectionInit({ scope: $scope, list: list, url: url, returnToCaller: 1 });
    }

    if ($scope.removePostRefresh) {
        $scope.removePostRefresh();
    }
    $scope.removePostRefresh = $scope.$on('PostRefresh', function () {
        // Cleanup after a delete
        Wait('stop');
        $('#prompt-modal').modal('hide');
    });

    $rootScope.flashMessage = null;
    SearchInit({
        scope: $scope,
        set: 'users',
        list: list,
        url: defaultUrl
    });
    PaginateInit({
        scope: $scope,
        list: list,
        url: defaultUrl
    });
    $scope.search(list.iterator);

    $scope.showActivity = function () {
        Stream({ scope: $scope });
    };

    $scope.addUser = function () {
        $state.transitionTo('users.add');
    };

    $scope.editUser = function (id) {
        $state.transitionTo('users.edit', {user_id: id});
    };

    $scope.deleteUser = function (id, name) {

        var action = function () {
            //$('#prompt-modal').on('hidden.bs.modal', function () {
            //    Wait('start');
            //});
            $('#prompt-modal').modal('hide');
            Wait('start');
            var url = defaultUrl + id + '/';
            Rest.setUrl(url);
            Rest.destroy()
                .success(function () {
                    $scope.search(list.iterator);
                })
                .error(function (data, status) {
                    ProcessErrors($scope, data, status, null, { hdr: 'Error!',
                        msg: 'Call to ' + url + ' failed. DELETE returned status: ' + status });
                });
        };

        Prompt({
            hdr: 'Delete',
            body: '<div class="Prompt-bodyQuery">Are you sure you want to delete the user below?</div><div class="Prompt-bodyTarget">' + name + '</div>',
            action: action,
            actionText: 'DELETE'
        });
    };
}

UsersList.$inject = ['$scope', '$rootScope', '$location', '$log',
    '$stateParams', 'Rest', 'Alert', 'UserList', 'generateList', 'Prompt',
    'SearchInit', 'PaginateInit', 'ReturnToCaller', 'ClearScope',
    'ProcessErrors', 'GetBasePath', 'SelectionInit', 'Wait', 'Stream', '$state',
    'Refresh'
];


export function UsersAdd($scope, $rootScope, $compile, $location, $log,
    $stateParams, UserForm, GenerateForm, Rest, Alert, ProcessErrors,
    ReturnToCaller, ClearScope, GetBasePath, LookUpInit, OrganizationList,
    ResetForm, Wait, $state) {

    ClearScope();

    // Inject dynamic view
    var defaultUrl = GetBasePath('organizations'),
        form = UserForm,
        generator = GenerateForm;

    generator.inject(form, { mode: 'add', related: false, scope: $scope });
    ResetForm();

    $scope.ldap_user = false;
    $scope.not_ldap_user = !$scope.ldap_user;
    $scope.ldap_dn = null;
    $scope.socialAuthUser = false;

    generator.reset();

    // Configure the lookup dialog. If we're adding a user through the Organizations tab,
    // default the Organization value.
    LookUpInit({
        scope: $scope,
        form: form,
        current_item: ($stateParams.organization_id !== undefined) ? $stateParams.organization_id : null,
        list: OrganizationList,
        field: 'organization',
        input_type: 'radio'
    });

    if ($stateParams.organization_id) {
        $scope.organization = $stateParams.organization_id;
        Rest.setUrl(GetBasePath('organizations') + $stateParams.organization_id + '/');
        Rest.get()
            .success(function (data) {
                $scope.organization_name = data.name;
            })
            .error(function (data, status) {
                ProcessErrors($scope, data, status, form, { hdr: 'Error!',
                    msg: 'Failed to lookup Organization: ' + data.id + '. GET returned status: ' + status });
            });
    }

    // Save
    $scope.formSave = function () {
        var fld, data = {};
        generator.clearApiErrors();
        generator.checkAutoFill();
        if ($scope[form.name + '_form'].$valid) {
            if ($scope.organization !== undefined && $scope.organization !== null && $scope.organization !== '') {
                Rest.setUrl(defaultUrl + $scope.organization + '/users/');
                for (fld in form.fields) {
                    if (form.fields[fld].realName) {
                        data[form.fields[fld].realName] = $scope[fld];
                    } else {
                        data[fld] = $scope[fld];
                    }
                }
                data.is_superuser = data.is_superuser || false;
                Wait('start');
                Rest.post(data)
                    .success(function (data) {
                        var base = $location.path().replace(/^\//, '').split('/')[0];
                        if (base === 'users') {
                            $rootScope.flashMessage = 'New user successfully created!';
                            $rootScope.$broadcast("EditIndicatorChange", "users", data.id);
                            $location.path('/users/' + data.id);
                        }
                        else {
                            ReturnToCaller(1);
                        }
                    })
                    .error(function (data, status) {
                        ProcessErrors($scope, data, status, form, { hdr: 'Error!', msg: 'Failed to add new user. POST returned status: ' + status });
                    });
            } else {
                $scope.organization_name_api_error = 'A value is required';
            }
        }
    };

    $scope.formCancel = function () {
        $state.transitionTo('users');
    };

    // Password change
    $scope.clearPWConfirm = function (fld) {
        // If password value changes, make sure password_confirm must be re-entered
        $scope[fld] = '';
        $scope[form.name + '_form'][fld].$setValidity('awpassmatch', false);
    };
}

UsersAdd.$inject = ['$scope', '$rootScope', '$compile', '$location', '$log',
    '$stateParams', 'UserForm', 'GenerateForm', 'Rest', 'Alert',
    'ProcessErrors', 'ReturnToCaller', 'ClearScope', 'GetBasePath',
    'LookUpInit', 'OrganizationList', 'ResetForm', 'Wait', '$state'
];


export function UsersEdit($scope, $rootScope, $compile, $location, $log,
    $stateParams, UserForm, GenerateForm, Rest, Alert, ProcessErrors,
    RelatedSearchInit, RelatedPaginateInit, ReturnToCaller, ClearScope,
    GetBasePath, Prompt, CheckAccess, ResetForm, Wait, Stream, fieldChoices,
    fieldLabels, permissionsSearchSelect, $state) {

    ClearScope();

    var defaultUrl = GetBasePath('users'),
        generator = GenerateForm,
        form = UserForm,
        base = $location.path().replace(/^\//, '').split('/')[0],
        master = {},
        id = $stateParams.user_id,
        relatedSets = {};

    $scope.permission_label = {};
    $scope.permission_search_select = [];

    $scope.$emit("RefreshUsersList");

    // return a promise from the options request with the permission type choices (including adhoc) as a param
    var permissionsChoice = fieldChoices({
        scope: $scope,
        url: 'api/v1/' + base + '/' + id + '/permissions/',
        field: 'permission_type'
    });

    // manipulate the choices from the options request to be set on
    // scope and be usable by the list form
    permissionsChoice.then(function (choices) {
        choices =
            fieldLabels({
                choices: choices
            });
        _.map(choices, function(n, key) {
            $scope.permission_label[key] = n;
        });
    });

    // manipulate the choices from the options request to be usable
    // by the search option for permission_type, you can't inject the
    // list until this is done!
    permissionsChoice.then(function (choices) {
        form.related.permissions.fields.permission_type.searchOptions =
            permissionsSearchSelect({
                choices: choices
            });
        generator.inject(form, { mode: 'edit', related: true, scope: $scope });
        generator.reset();
        $scope.$emit("loadForm");
    });

    if ($scope.removeFormReady) {
        $scope.removeFormReady();
    }
    $scope.removeFormReady = $scope.$on('formReady', function () {
        if ($scope.removePostRefresh) {
            $scope.removePostRefresh();
        }
        $scope.removePostRefresh = $scope.$on('PostRefresh', function () {
            // Cleanup after a delete
            Wait('stop');
            $('#prompt-modal').modal('hide');
        });

        $scope.PermissionAddAllowed = false;

        // After the Organization is loaded, retrieve each related set
        if ($scope.removeUserLoaded) {
            $scope.removeUserLoaded();
        }
        $scope.removeUserLoaded = $scope.$on('userLoaded', function () {
            for (var set in relatedSets) {
                $scope.search(relatedSets[set].iterator);
            }
            CheckAccess({ scope: $scope }); //Does the user have access to add/edit Permissions?
            Wait('stop');
        });

        // Retrieve detail record and prepopulate the form
        Rest.setUrl(defaultUrl + ':id/');
        Rest.get({ params: { id: id } })
            .success(function (data) {
                $scope.user_id = id;
                $scope.username_title = data.username;
                var fld, related, set;
                for (fld in form.fields) {
                    if (data[fld]) {
                        if (fld === 'is_superuser') {
                            $scope[fld] = (data[fld] === 'true' || data[fld] === true) ? 'true' : 'false';
                        } else {
                            $scope[fld] = data[fld];
                        }
                        master[fld] = $scope[fld];
                    }
                }
                related = data.related;
                for (set in form.related) {
                    if (related[set]) {
                        relatedSets[set] = {
                            url: related[set],
                            iterator: form.related[set].iterator
                        };
                    }
                }

                $scope.ldap_user = (data.ldap_dn !== null && data.ldap_dn !== undefined && data.ldap_dn !== '') ? true : false;
                $scope.not_ldap_user = !$scope.ldap_user;
                master.ldap_user = $scope.ldap_user;
                $scope.socialAuthUser = (data.auth.length > 0) ? true : false;

                // Initialize related search functions. Doing it here to make sure relatedSets object is populated.
                RelatedSearchInit({
                    scope: $scope,
                    form: form,
                    relatedSets: relatedSets
                });
                RelatedPaginateInit({
                    scope: $scope,
                    relatedSets: relatedSets
                });
                $scope.$emit('userLoaded');
            })
            .error(function (data, status) {
                ProcessErrors($scope, data, status, null, { hdr: 'Error!', msg: 'Failed to retrieve user: ' +
                    $stateParams.id + '. GET status: ' + status });
            });

        $scope.getPermissionText = function () {
            if (this.permission.permission_type !== "admin" && this.permission.run_ad_hoc_commands) {
                return $scope.permission_label[this.permission.permission_type] +
                " and " + $scope.permission_label.adhoc;
            } else {
                return $scope.permission_label[this.permission.permission_type];
            }
        };

        // Save changes to the parent
        $scope.formSave = function () {
            var data = {}, fld;
            generator.clearApiErrors();
            generator.checkAutoFill();
            $rootScope.flashMessage = null;
            if ($scope[form.name + '_form'].$valid) {
                Rest.setUrl(defaultUrl + id + '/');
                for (fld in form.fields) {
                    if (form.fields[fld].realName) {
                        data[form.fields[fld].realName] = $scope[fld];
                    } else {
                        data[fld] = $scope[fld];
                    }
                }

                data.is_superuser = data.is_superuser || false;

                Wait('start');
                Rest.put(data)
                    .success(function () {
                        Wait('stop');
                        $scope.username_title = $scope.username;
                        var base = $location.path().replace(/^\//, '').split('/')[0];
                        if (base === 'users') {
                            ReturnToCaller();
                        }
                        else {
                            ReturnToCaller(1);
                        }
                    })
                    .error(function (data, status) {
                        ProcessErrors($scope, data, status, form, { hdr: 'Error!', msg: 'Failed to update users: ' + $stateParams.id +
                            '. PUT status: ' + status });
                    });
            }
        };

        $scope.showActivity = function () {
            Stream({ scope: $scope });
        };

        $scope.formCancel = function () {
            $state.transitionTo('users');
        };

        // Password change
        $scope.clearPWConfirm = function (fld) {
            // If password value changes, make sure password_confirm must be re-entered
            $scope[fld] = '';
            $scope[form.name + '_form'][fld].$setValidity('awpassmatch', false);
            $rootScope.flashMessage = null;
        };


        // Related set: Add button
        $scope.add = function (set) {
            $rootScope.flashMessage = null;
            if (set === 'permissions') {
                if ($scope.PermissionAddAllowed) {
                    $location.path('/' + base + '/' + $stateParams.user_id + '/' + set + '/add');
                } else {
                    Alert('Access Denied', 'You do not have access to this function. Please contact your system administrator.');
                }
            } else {
                $location.path('/' + base + '/' + $stateParams.user_id + '/' + set);
            }
        };

        // Related set: Edit button
        $scope.edit = function (set, id) {
            $rootScope.flashMessage = null;
            if (set === 'permissions') {
                $location.path('/users/' + $stateParams.user_id + '/permissions/' + id);
            } else {
                $location.path('/' + set + '/' + id);
            }
        };

        // Related set: Delete button
        $scope['delete'] = function (set, itm_id, name, title) {
            $rootScope.flashMessage = null;

            var action = function () {
                var url;
                if (set === 'permissions') {
                    if ($scope.PermissionAddAllowed) {
                        url = GetBasePath('base') + 'permissions/' + itm_id + '/';
                        Rest.setUrl(url);
                        Rest.destroy()
                            .success(function () {
                                $('#prompt-modal').modal('hide');
                                $scope.search(form.related[set].iterator);
                            })
                            .error(function (data, status) {
                                $('#prompt-modal').modal('hide');
                                ProcessErrors($scope, data, status, null, { hdr: 'Error!',
                                    msg: 'Call to ' + url + ' failed. DELETE returned status: ' + status });
                            });
                    } else {
                        Alert('Access Denied', 'You do not have access to this function. Please contact your system administrator.');
                    }
                } else {
                    url = defaultUrl + $stateParams.user_id + '/' + set + '/';
                    Rest.setUrl(url);
                    Rest.post({
                        id: itm_id,
                        disassociate: 1
                    })
                        .success(function () {
                            $('#prompt-modal').modal('hide');
                            $scope.search(form.related[set].iterator);
                        })
                        .error(function (data, status) {
                            $('#prompt-modal').modal('hide');
                            ProcessErrors($scope, data, status, null, { hdr: 'Error!',
                                msg: 'Call to ' + url + ' failed. POST returned status: ' + status });
                        });
                }
            };

            Prompt({
                hdr: 'Delete',
                body: '<div class="Prompt-bodyQuery">Are you sure you want to remove the ' + title + ' below from ' + $scope.username + '?</div><div class="Prompt-bodyTarget">' + name + '</div>',
                action: action,
                actionText: 'DELETE'
            });
        };
    }); // $scope.$on

    // Put form back to its original state
    ResetForm();

    if ($scope.removeLoadForm) {
        $scope.removeLoadForm();
    }
    $scope.removeLoadForm = $scope.$on('loadForm', function () {


        if ($scope.removeModifyForm) {
            $scope.removeModifyForm();
        }
        $scope.removeModifyForm = $scope.$on('modifyForm', function () {
            // Modify form based on LDAP settings
            Rest.setUrl(GetBasePath('config'));
            Rest.get()
                .success(function (data) {
                    var i, fld;
                    if (data.user_ldap_fields) {
                        for (i = 0; i < data.user_ldap_fields.length; i++) {
                            fld = data.user_ldap_fields[i];
                            if (form.fields[fld]) {
                                form.fields[fld].readonly = true;
                                form.fields[fld].editRequired = false;
                                if (form.fields[fld].awRequiredWhen) {
                                    delete form.fields[fld].awRequiredWhen;
                                }
                            }
                        }
                    }
                    $scope.$emit('formReady');
                })
                .error(function (data, status) {
                    ProcessErrors($scope, data, status, null, { hdr: 'Error!',
                        msg: 'Failed to retrieve application config. GET status: ' + status });
                });
        });

        Wait('start');
        Rest.setUrl(defaultUrl + id + '/');
        Rest.get()
            .success(function (data) {
                if (data.ldap_dn !== null && data.ldap_dn !== undefined && data.ldap_dn !== '') {
                    //this is an LDAP user
                    $scope.$emit('modifyForm');
                } else {
                    $scope.$emit('formReady');
                }
            })
            .error(function (data, status) {
                ProcessErrors($scope, data, status, null, { hdr: 'Error!',
                    msg: 'Failed to retrieve user: ' + id + '. GET status: ' + status });
            });
    });
}

UsersEdit.$inject = ['$scope', '$rootScope', '$compile', '$location', '$log',
    '$stateParams', 'UserForm', 'GenerateForm', 'Rest', 'Alert',
    'ProcessErrors', 'RelatedSearchInit', 'RelatedPaginateInit',
    'ReturnToCaller', 'ClearScope', 'GetBasePath', 'Prompt', 'CheckAccess',
    'ResetForm', 'Wait', 'Stream', 'fieldChoices', 'fieldLabels',
    'permissionsSearchSelect', '$state'
];
